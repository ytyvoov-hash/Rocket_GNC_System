import sys

filepath = 'm:/2026-5-18gnc-2/2026-5-18gnc-2/project_GNC-V6.0/gnc-frontend/src/S5_MissionConfig.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# Add the useAppSelector for controllers
if 'const controllerLib = useAppSelector(s => s.controllerLibrary.entries);' not in text:
    text = text.replace(
        'const operatorId = useAppSelector(s => s.auth.operatorId);',
        'const operatorId = useAppSelector(s => s.auth.operatorId);\n  const controllerLib = useAppSelector(s => s.controllerLibrary?.entries || {});\n  const controllerOptions = Object.values(controllerLib);'
    )

text = text.replace(
    '{mission.controller_profiles.map(cp => (\\n                            <option key={cp.id} value={cp.id}>{cp.name}</option>\\n                          ))}',
    '{controllerOptions.map(cp => (\\n                            <option key={cp.id} value={cp.id}>{cp.name}</option>\\n                          ))}'
)

# And for estimators: there is no global estimator library yet. We will mock it or just replace mission.estimator_profiles.map too.
text = text.replace(
    '{mission.estimator_profiles.map(ep => (\\n                            <option key={ep.id} value={ep.id}>{ep.name}</option>\\n                          ))}',
    '{ /* TODO: Replace with global Estimator Library */ }\\n                          {mission.estimator_profiles.map(ep => (\\n                            <option key={ep.id} value={ep.id}>{ep.name}</option>\\n                          ))}'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
