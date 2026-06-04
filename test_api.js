const http = require('http');

// 1. Fetch the real BA configuration from the backend
const reqLoad = http.request({
  hostname: 'localhost',
  port: 8080,
  path: '/api/v1/simulation/load-rocket',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    // 2. The tables are now loaded into the backend's memory cache.
    // Now we create the simulation request utilizing the correct parameters for the BA template.
    const payload = JSON.stringify({
      template_id: 'BA',
      phases: [],
      sim: {
        sim_mode: '3dof',
        mass_init_kg: 350.0,
        mass_dry_kg: 200.0,
        thrust_N: 5000, // fallback
        burn_time_s: 13.1, // matches true thrust_curve.csv duration
        cd_A_m2: 0.0314,
        gravity_m_s2: 9.81,
        t_end_s: 180,
        dt_s: 0.01,
        initial_conditions: {
          position: [0, 0, 0],
          attitude: [0.8338858, 0, 0.551937, 0] // 67-degree pitch
        },
        launch: { latitude: 16.45, longitude: 44.11, altitude: 0 },
        target: { range_m: 10000, bearing_deg: 0, altitude: 0 }
      }
    });

    // 3. Start the simulation
    const reqStart = http.request({
      hostname: 'localhost',
      port: 8080,
      path: '/api/v1/simulation/start',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, resStart => {
      let bodyStart = '';
      resStart.on('data', d => bodyStart += d);
      resStart.on('end', () => console.log('Status:', resStart.statusCode, 'Body:', bodyStart));
    });

    reqStart.on('error', e => console.error(e));
    reqStart.write(payload);
    reqStart.end();
  });
});

reqLoad.on('error', e => console.error(e));
reqLoad.write(JSON.stringify({ template_id: 'BA' }));
reqLoad.end();
