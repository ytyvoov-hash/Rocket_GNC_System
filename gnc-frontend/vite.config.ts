import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import cesium from 'vite-plugin-cesium'

// Custom Vite plugin to handle local filesystem operations for rockets (C++ backend mock fallback bypass)
function gncLocalFilesystemPlugin() {
  return {
    name: 'gnc-local-filesystem',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const rocketsDir = path.resolve(__dirname, '../rockets');

        // Static serving of '/rockets/*'
        if (req.url && req.url.startsWith('/rockets/')) {
          const urlPath = req.url.split('?')[0];
          const relativePath = decodeURIComponent(urlPath.slice(9)); // Remove '/rockets/'
          const filePath = path.join(rocketsDir, relativePath);
          const ext = path.extname(filePath).toLowerCase();

          // Dynamic compilation fallback for GLB requested files
          if (ext === '.glb' && !fs.existsSync(filePath)) {
            const parts = relativePath.split('/');
            const id = parts[0]; // e.g., 'BA'
            const precompiledPath = path.resolve(__dirname, '../cad-converter/output', `${id}.glb`);

            if (fs.existsSync(precompiledPath)) {
              console.log(`[DEBUG] Found precompiled GLB at ${precompiledPath}, copying to ${filePath}`);
              try {
                fs.copyFileSync(precompiledPath, filePath);
              } catch (e: any) {
                console.error(`[DEBUG] Copy precompiled GLB failed:`, e.message);
              }
            } else {
              // Look for CAD source files in rockets/<id> folder (checking both uppercase and lowercase extensions)
              const cadExtensions = ['.SLDPRT', '.sldprt', '.step', '.STEP', '.stp', '.STP'];
              let cadPath = '';
              for (const ext of cadExtensions) {
                const testPath = path.join(rocketsDir, id, `${id}${ext}`);
                if (fs.existsSync(testPath)) {
                  cadPath = testPath;
                  break;
                }
              }

              if (cadPath) {
                console.log(`[DEBUG] No GLB found, but CAD source exists at ${cadPath}. Triggering cad-converter...`);
                try {
                  const convertScript = path.resolve(__dirname, '../cad-converter/convert.py');
                  const outDir = path.join(rocketsDir, id);
                  const cmd = `python "${convertScript}" "${cadPath}" --out-dir "${outDir}"`;
                  console.log(`[DEBUG] Running command: ${cmd}`);
                  execSync(cmd, { stdio: 'inherit' });

                  // Copy the generated physical properties JSON to geometry.json
                  const genJson = path.join(outDir, `${id}_geometry.json`);
                  const targetJson = path.join(outDir, `geometry.json`);
                  if (fs.existsSync(genJson)) {
                    fs.copyFileSync(genJson, targetJson);
                    console.log(`[DEBUG] Extracted geometry properties copied to ${targetJson}`);
                  }
                } catch (err: any) {
                  console.error('[DEBUG] CAD-to-GLB conversion execution failed:', err.message);
                }
              }


            }
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            let contentType = 'text/plain';
            if (ext === '.csv') contentType = 'text/csv';
            else if (ext === '.yaml' || ext === '.yml') contentType = 'text/yaml';
            else if (ext === '.json') contentType = 'application/json';
            else if (ext === '.glb') contentType = 'model/gltf-binary';
            
            res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
            res.end(fs.readFileSync(filePath));
            return;
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
          }
        }

        // Only intercept mutating template API endpoints
        if (req.url && req.url.startsWith('/api/v1/templates')) {
          const manifestPath = path.resolve(__dirname, '../release_manifest.yaml');

          // Helper to update release_manifest.yaml
          const registerRocketInManifest = (id: string) => {
            if (fs.existsSync(manifestPath)) {
              let content = fs.readFileSync(manifestPath, 'utf8');
              if (!content.includes(id)) {
                // If it has committed_rockets: array, append to it
                if (content.includes('committed_rockets:')) {
                  content = content.replace(/committed_rockets:\s*([\s\S]*?)(?=\n\w|$)/, (_match: string, p1: string) => {
                    const lines = p1.trim().split('\n');
                    lines.push(`  - ${id}`);
                    return `committed_rockets:\n${lines.map((l: string) => l.trim() ? `  ${l.trim()}` : '').join('\n')}`;
                  });
                } else {
                  content += `\ncommitted_rockets:\n  - ${id}\n`;
                }
                fs.writeFileSync(manifestPath, content, 'utf8');
              }
            }
          };

          // Helper to remove rocket from release_manifest.yaml
          const unregisterRocketInManifest = (id: string) => {
            if (fs.existsSync(manifestPath)) {
              let content = fs.readFileSync(manifestPath, 'utf8');
              const regex = new RegExp(`\\s*-\\s*${id}\\r?\\n?`, 'g');
              content = content.replace(regex, '\n');
              fs.writeFileSync(manifestPath, content, 'utf8');
            }
          };

          // Helper to read JSON request body
          const readBody = (): Promise<any> => {
            return new Promise((resolve) => {
              let body = '';
              req.on('data', (chunk: any) => body += chunk);
              req.on('end', () => {
                try {
                  console.log('[DEBUG] Raw body read:', body);
                  const parsed = body ? JSON.parse(body) : {};
                  console.log('[DEBUG] Parsed body:', parsed);
                  resolve(parsed);
                } catch (e) {
                  console.error('[DEBUG] Body parse error:', e);
                  resolve({});
                }
              });
            });
          };

          const urlObj = new URL(req.url, 'http://localhost');
          const pathname = urlObj.pathname;

          // 1. DELETE /api/v1/templates/:id (Delete rocket folder & files)
          if (req.method === 'DELETE' && pathname.startsWith('/api/v1/templates/')) {
            const parts = pathname.split('/');
            const id = parts[parts.length - 1];
            if (id && id !== 'templates') {
              const targetDir = path.join(rocketsDir, id);
              try {
                if (fs.existsSync(targetDir)) {
                  fs.rmSync(targetDir, { recursive: true, force: true });
                  unregisterRocketInManifest(id);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, template_id: id }));
                  return;
                } else {
                  console.warn(`[DEBUG] Delete target folder not found: ${targetDir}`);
                }
              } catch (e: any) {
                console.error(`[DEBUG] Failed to delete target folder ${targetDir}:`, e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to delete directory: ${e.message}` }));
                return;
              }
            }
          }

          // 2. POST /api/v1/templates/:id/duplicate (Clone rocket folder & files)
          if (req.method === 'POST' && pathname.endsWith('/duplicate')) {
            const parts = pathname.split('/');
            const id = parts[parts.length - 2];
            if (id) {
              const sourceDir = path.join(rocketsDir, id);
              const copyId = `${id}_copy`;
              const targetDir = path.join(rocketsDir, copyId);
              try {
                if (fs.existsSync(sourceDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                  // Copy all files recursively
                  const copyRecursive = (src: string, dest: string) => {
                    const exists = fs.existsSync(src);
                    const stats = exists && fs.statSync(src);
                    const isDirectory = stats && stats.isDirectory();
                    if (isDirectory) {
                      if (!fs.existsSync(dest)) fs.mkdirSync(dest);
                      fs.readdirSync(src).forEach(childItemName => {
                        copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
                      });
                    } else {
                      fs.copyFileSync(src, dest);
                    }
                  };
                  copyRecursive(sourceDir, targetDir);

                  // Update template_id and display_name in rocket_properties.yaml copy
                  const propsPath = path.join(targetDir, 'rocket_properties.yaml');
                  if (fs.existsSync(propsPath)) {
                    let props = fs.readFileSync(propsPath, 'utf8');
                    props = props.replace(/template_id:\s*["']?([a-zA-Z0-9_-]+)["']?/, `template_id: "${copyId}"`);
                    props = props.replace(/display_name:\s*["']?([^"'\r\n]+)["']?/, `display_name: "${id} Copy"`);
                    fs.writeFileSync(propsPath, props, 'utf8');
                  }

                  registerRocketInManifest(copyId);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, template_id: copyId }));
                  return;
                } else {
                  console.warn(`[DEBUG] Duplicate source folder not found: ${sourceDir}`);
                }
              } catch (e: any) {
                console.error(`[DEBUG] Failed to duplicate folder ${sourceDir}:`, e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Failed to duplicate directory: ${e.message}` }));
                return;
              }
            }
          }

          // 3. POST /api/v1/templates (Import / Create rocket)
          if (req.method === 'POST') {
            const body = await readBody();
            
            // Check if it is a file import (JSON carrying file content) or direct creation
            const isImport = body.content !== undefined;
            let templateId = body.template_id || '';
            let displayName = body.display_name || '';
            let type = body.type || 'unknown';
            let yamlContent = body.content || '';

            if (isImport) {
              // Regex parse imported YAML to fetch template metadata
              const idMatch = yamlContent.match(/template_id:\s*["']?([a-zA-Z0-9_-]+)["']?/);
              const nameMatch = yamlContent.match(/display_name:\s*["']?([^"'\r\n]+)["']?/);
              const typeMatch = yamlContent.match(/type:\s*["']?([^"'\r\n]+)["']?/);
              
              templateId = idMatch ? idMatch[1] : `imported_${Date.now()}`;
              displayName = nameMatch ? nameMatch[1] : templateId;
              type = typeMatch ? typeMatch[1] : 'imported';
            }

            if (!templateId) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'template_id is required' }));
              return;
            }

            const targetDir = path.join(rocketsDir, templateId);
            fs.mkdirSync(targetDir, { recursive: true });
            fs.mkdirSync(path.join(targetDir, 'golden'), { recursive: true });

            if (isImport) {
              // Write uploaded YAML
              fs.writeFileSync(path.join(targetDir, 'rocket_properties.yaml'), yamlContent, 'utf8');
            } else {
              // Direct creation: Author standard compliant rocket_properties.yaml
              const defaultProperties = `# Canonical Rocket properties file for ${displayName}
schema_version: "v5.4"
template_id: "${templateId}"
display_name: "${displayName}"
type: "${type}"
status: "draft"
num_stages: ${body.num_stages || 1}

stages:
  - stage_id: "${templateId}_S1"
    name: "Stage 1"
    stage_index: 0
    is_terminal: true
    has_warhead: false
    physical:
      mass_dry_kg: ${body.mass_dry_kg || 150}
      propellant_mass_kg: ${body.propellant_mass_kg || 100}
      insulation_mass_kg: 2
      cg_dry_body_m: [1.5, 0.0, 0.0]
      cg_full_body_m: [1.8, 0.0, 0.0]
      inertia_dry_kgm2: [2.0, 450.0, 450.0]
      inertia_full_kgm2: [3.5, 600.0, 600.0]
    geometry:
      ref_diameter_m: ${body.ref_diameter_m || 0.2}
      ref_length_m: ${body.ref_length_m || 3.0}
      ref_area_m2: 0.0314
    controller_type: "${body.controller_type || 'fins'}"
    controller_ref: "pid_fins_baseline"
    seeker_capable: false
    autopilot:
      enabled: true
      capable_modes: ["auto_shape", "fixed_pitch", "passive_ballistic"]
    fin_config:
      sets:
        - set_index: 0
          fin_count: 4
          S_fin_m2: 0.015
          c_fin_m: 0.12
          x_fin_m: 0.8
          delta_max_deg: 20.0
          delta_dot_max_deg_s: 300.0
          actuator_ref: "default_4020"
          config_type: "X"
`;
              fs.writeFileSync(path.join(targetDir, 'rocket_properties.yaml'), defaultProperties, 'utf8');
            }

            // Generate clean default hardware mapping schema (Appendix A.6)
            const defaultHardware = `# Hardware Mapping for ${displayName}
schema_version: "v5.4"
flight_computer_variant: STM32H743
servo_protocol: canopen
bus:
  type: classic_can
  bitrate_bps: 1000000
  utilisation_budget_pct: 70
  bridge:
    type: ch340
    vid: "0x1A86"
    pid: "0x7523"
servos:
  - { stage_index: 0, fin_index: 0, node_id: "0x25", actuator_ref: default_4020, installed: true }
  - { stage_index: 0, fin_index: 1, node_id: "0x26", actuator_ref: default_4020, installed: true }
  - { stage_index: 0, fin_index: 2, node_id: "0x27", actuator_ref: default_4020, installed: true }
  - { stage_index: 0, fin_index: 3, node_id: "0x28", actuator_ref: default_4020, installed: true }
`;
            fs.writeFileSync(path.join(targetDir, 'hardware_mapping.yaml'), defaultHardware, 'utf8');

            // Generate other optional siblings
            fs.writeFileSync(path.join(targetDir, 'tolerances.yaml'), 'schema_version: "v5.4"\ntolerances:\n  position_m: 0.5\n  velocity_m_s: 0.1\n', 'utf8');
            fs.writeFileSync(path.join(targetDir, 'scenarios.yaml'), 'schema_version: "v5.4"\nscenarios:\n  - name: "Nominal Ascent"\n    wind_speed_m_s: 0.0\n', 'utf8');
            fs.writeFileSync(path.join(targetDir, 'envelope.yaml'), 'schema_version: "v5.4"\nenvelope:\n  mach_range: [0.1, 2.5]\n', 'utf8');

            registerRocketInManifest(templateId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              template_id: templateId,
              validation: { overall: 'PASS', clauses: [] }
            }));
            return;
          }
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    gncLocalFilesystemPlugin(),
    cesium()
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
