import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv(r'm:\2026-5-18gnc-2\2026-5-18gnc-2\project_GNC-V6.0\logs\sim_run_run_8016db3d2b567c5d.csv')
plt.figure(figsize=(10, 6))
plt.plot(df['position_x_m'] / 1000, df['altitude_m'] / 1000, label='Trajectory', color='b', linewidth=2)
plt.title('BA Rocket: Altitude vs Range (67 deg launch)')
plt.xlabel('Range X (km)')
plt.ylabel('Altitude (km)')
plt.grid(True)
plt.legend()
plt.tight_layout()
plt.savefig(r'C:\Users\MR\.gemini\antigravity\brain\93def232-e0ec-412f-9fbf-a1e7e633d4fb\traj.png')
