lines = open('gnc-backend/src/controllers/SimulationController.cc').readlines()
with open('gnc-backend/src/controllers/SimulationController.cc', 'w') as f:
    f.writelines(lines[:116] + lines[209:])
