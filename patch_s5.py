import sys

filepath = 'm:/2026-5-18gnc-2/2026-5-18gnc-2/project_GNC-V6.0/gnc-frontend/src/S5_MissionConfig.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = lines[:613] + lines[737:]
text = ''.join(new_lines)

text = text.replace(
    '''const ALL_TABS = ['stages', 'profiles', 'launch_target', 'seeker', 'safety', 'env', 'logging', 'yaml'] as const;''',
    '''const ALL_TABS = ['stages', 'launch_target', 'seeker', 'safety', 'env', 'logging', 'yaml'] as const;'''
)
text = text.replace(
    '''stages: 'Flight Sequence', profiles: 'GNC Profiles', launch_target: 'Launch & Target', seeker: 'Seeker', safety: 'Safety Zone',''',
    '''stages: 'Flight Sequence', launch_target: 'Launch & Target', seeker: 'Seeker', safety: 'Safety Zone','''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
