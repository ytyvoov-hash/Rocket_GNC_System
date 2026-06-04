$content = Get-Content S4_RocketEditor.tsx -Raw
$content = $content -replace '(?s)          \{/\* Aero Tab \*/\}.*?\{/\* Propulsion Tab \*/\}', '          {/* Aero Tab */}
          {activeTab === ''aero'' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="h-96 w-full bg-slate-900 overflow-hidden border border-slate-700 rounded-xl relative">
                {dynamicAeroData.length > 0 ? (
                  <HotTable
                    data={hotAeroData}
                    colHeaders={[''Mach'', ''Alpha (deg)'', ''Cd'', ''Cn'', ''Cma'', ''Cnp'', ''Cyp'']}
                    rowHeaders={true}
                    width="100%"
                    height="100%"
                    licenseKey="non-commercial-and-evaluation"
                    theme="ht-theme-main-dark-auto"
                    className="ht-theme-main-dark-auto custom-hot-table text-xs"
                    stretchH="all"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    No aerodynamic data loaded
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Propulsion Tab */}'

[System.IO.File]::WriteAllText("M:\2026-5-18gnc-2\2026-5-18gnc-2\project_GNC-V6.0\gnc-frontend\src\S4_RocketEditor.tsx", $content, [System.Text.Encoding]::UTF8)
