import tkinter as tk
from tkinter import ttk
import serial
import serial.tools.list_ports
import threading
import struct
import time
from collections import deque

import matplotlib
matplotlib.use('TkAgg')
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt

def get_crc16(data, count):
    crc = 0
    for i in range(count):
        temp = data[i]
        temp = temp << 8
        crc = crc ^ temp
        for _ in range(8):
            if (crc & 0x8000) != 0:
                crc = crc << 1
                crc = crc ^ 0x1021
            else:
                crc = crc << 1
            crc = crc & 0xFFFF
    return crc & 0xFFFF

class LED(tk.Canvas):
    def __init__(self, master, size=20, color_off="gray", color_on="green", **kwargs):
        super().__init__(master, width=size, height=size, highlightthickness=0, **kwargs)
        self.size = size
        self.color_off = color_off
        self.color_on = color_on
        self.state = False
        self.oval = self.create_oval(2, 2, size-2, size-2, fill=self.color_off, outline="black")
        
    def set_state(self, state):
        self.state = bool(state)
        color = self.color_on if self.state else self.color_off
        self.itemconfig(self.oval, fill=color)

class AdvancedTelemetryGCS:
    def __init__(self, root):
        self.root = root
        self.root.title("OnePlus AI Robotics - Ground Control Station (GCS)")
        self.root.geometry("1200x800")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        self.serial_port = None
        self.is_running = False
        
        # Real-time Graph Buffers
        self.max_pts = 100
        self.times = deque(maxlen=self.max_pts)
        self.yaws = deque(maxlen=self.max_pts)
        self.pitches = deque(maxlen=self.max_pts)
        self.yaw_rates = deque(maxlen=self.max_pts)
        self.pitch_rates = deque(maxlen=self.max_pts)
        self.start_time = time.time()
        
        self._setup_ui()
        
    def _setup_ui(self):
        # --- TOP PANEL: Connection Control ---
        top_frame = tk.Frame(self.root, bd=2, relief=tk.GROOVE)
        top_frame.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
        
        tk.Label(top_frame, text="COM Port:", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=5)
        self.cb_ports = ttk.Combobox(top_frame, values=[p.device for p in serial.tools.list_ports.comports()], state="readonly", width=15)
        self.cb_ports.pack(side=tk.LEFT, padx=5)
        if self.cb_ports['values']: self.cb_ports.current(0)
        
        tk.Button(top_frame, text="Refresh Ports", command=self.refresh_ports).pack(side=tk.LEFT, padx=5)
        self.btn_connect = tk.Button(top_frame, text="CONNECT", width=12, bg="gray", fg="white", font=("Arial", 10, "bold"), command=self.toggle_connection)
        self.btn_connect.pack(side=tk.LEFT, padx=20)
        
        # Split Window: Left Control Panel | Right Graphs
        main_frame = tk.Frame(self.root)
        main_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        left_panel = tk.Frame(main_frame, width=350)
        left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=5)
        right_panel = tk.Frame(main_frame)
        right_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        # --- LEFT PANEL: RX / TX Variables & LEDs ---
        
        # 1. RX Telemetry
        rx_group = tk.LabelFrame(left_panel, text="Downlink (App -> MCU)", font=("Arial", 10, "bold"))
        rx_group.pack(side=tk.TOP, fill=tk.X, pady=5)
        
        self.rx_vars = {}
        for row, label in enumerate(["Yaw (°)", "Pitch (°)", "Yaw Rate", "Pitch Rate", "Target X", "Target Y", "Target Width", "Target Height", "CPU Temp (°C)", "Zoom"]):
            tk.Label(rx_group, text=label+":").grid(row=row, column=0, sticky="e", padx=5, pady=3)
            var = tk.StringVar(value="0.0")
            self.rx_vars[label] = var
            # Value box
            tk.Entry(rx_group, textvariable=var, state="readonly", width=12, justify="center", font=("Courier", 10, "bold")).grid(row=row, column=1, padx=5, pady=3)
            
        # LED Indicators
        ind_frame = tk.Frame(rx_group)
        ind_frame.grid(row=10, column=0, columnspan=2, pady=10)
        
        tk.Label(ind_frame, text="Camera").grid(row=0, column=0)
        self.led_cam = LED(ind_frame, color_on="green")
        self.led_cam.grid(row=0, column=1, padx=10)
        
        tk.Label(ind_frame, text="Locked").grid(row=0, column=2)
        self.led_lock = LED(ind_frame, color_on="red")
        self.led_lock.grid(row=0, column=3, padx=10)
        
        # IPU State Information
        tk.Label(rx_group, text="System State:").grid(row=11, column=0, sticky="e")
        self.var_ipu_state = tk.StringVar(value="Unknown")
        tk.Label(rx_group, textvariable=self.var_ipu_state, fg="blue", font=("Arial", 10, "bold")).grid(row=11, column=1, sticky="w")
        
        tk.Label(rx_group, text="Target Count:").grid(row=12, column=0, sticky="e")
        self.var_targets = tk.StringVar(value="0")
        tk.Label(rx_group, textvariable=self.var_targets, fg="blue", font=("Arial", 10, "bold")).grid(row=12, column=1, sticky="w")
        
        # 2. TX Commands
        tx_group = tk.LabelFrame(left_panel, text="Uplink (MCU -> App)", font=("Arial", 10, "bold"))
        tx_group.pack(side=tk.TOP, fill=tk.X, pady=15)
        
        self.tx_vars = {
            "Stab_Mode": tk.IntVar(value=1),
            "Camera_Mode": tk.IntVar(value=0),
            "TX_Yaw": tk.DoubleVar(value=0.0),
            "TX_Pitch": tk.DoubleVar(value=0.0),
            "Ctrl_Cmd": tk.IntVar(value=0),
            "Ctrl_Fire": tk.IntVar(value=0),
            "Ctrl_Link": tk.IntVar(value=1)
        }
        
        tk.Checkbutton(tx_group, text="Enable Stabilization", variable=self.tx_vars["Stab_Mode"], font=("Arial", 9, "bold")).grid(row=0, column=0, columnspan=2, sticky="w", padx=5)
        
        # خيارات التحكم (Ctrl Byte Options)
        tk.Label(tx_group, text="Ctrl Command:").grid(row=1, column=0, sticky="e", pady=2)
        cmd_box = ttk.Combobox(tx_group, values=["0: None", "1: Stop", "2: Search", "3: Track"], state="readonly", width=12)
        cmd_box.current(0)
        cmd_box.bind("<<ComboboxSelected>>", lambda e: self.tx_vars["Ctrl_Cmd"].set(cmd_box.current()))
        cmd_box.grid(row=1, column=1, pady=2, sticky="w")
        
        tk.Checkbutton(tx_group, text="LINK Connected", variable=self.tx_vars["Ctrl_Link"], fg="blue", font=("Arial", 9, "bold")).grid(row=2, column=0, sticky="w", padx=5)
        tk.Checkbutton(tx_group, text="FIRE Weapon", variable=self.tx_vars["Ctrl_Fire"], fg="red", font=("Arial", 9, "bold")).grid(row=2, column=1, sticky="w", padx=5)
        
        tk.Label(tx_group, text="Override Yaw:").grid(row=3, column=0, sticky="e", pady=5)
        tk.Entry(tx_group, textvariable=self.tx_vars["TX_Yaw"], width=8).grid(row=3, column=1, pady=5, sticky="w")
        
        tk.Label(tx_group, text="Override Pitch:").grid(row=4, column=0, sticky="e", pady=5)
        tk.Entry(tx_group, textvariable=self.tx_vars["TX_Pitch"], width=8).grid(row=4, column=1, pady=5, sticky="w")
        
        bt_frame = tk.Frame(tx_group)
        bt_frame.grid(row=5, column=0, columnspan=2, pady=10)
        tk.Button(bt_frame, text="Zero Gyro", command=lambda: self.tx_vars["TX_Yaw"].set(0) or self.tx_vars["TX_Pitch"].set(0)).pack(side=tk.LEFT, padx=5)
        tk.Button(bt_frame, text="Clear Data", command=lambda: self.tx_vars["Camera_Mode"].set(0)).pack(side=tk.LEFT, padx=5)
        
        self.is_tx_enabled = False
        self.btn_tx = tk.Button(bt_frame, text="START TX", bg="green", fg="white", font=("Arial", 9, "bold"), command=self.toggle_tx)
        self.btn_tx.pack(side=tk.LEFT, padx=5)

        # --- RIGHT PANEL: GRAPHS ---
        self.fig, (self.ax_pos, self.ax_rate) = plt.subplots(2, 1, figsize=(6, 6), dpi=100)
        self.fig.tight_layout(pad=3.0)
        self.canvas = FigureCanvasTkAgg(self.fig, master=right_panel)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
        
        # Position Plot
        self.line_yaw, = self.ax_pos.plot([], [], 'b-', label='Yaw', linewidth=1.5)
        self.line_pitch, = self.ax_pos.plot([], [], 'r-', label='Pitch', linewidth=1.5)
        self.ax_pos.set_title("Angles Over Time (°)", fontsize=12)
        self.ax_pos.legend()
        self.ax_pos.grid(True, linestyle="--", alpha=0.6)
        
        # Rate Plot
        self.line_yr, = self.ax_rate.plot([], [], 'c-', label='Yaw Rate', linewidth=1.5)
        self.line_pr, = self.ax_rate.plot([], [], 'm-', label='Pitch Rate', linewidth=1.5)
        self.ax_rate.set_title("Rates Over Time (°/s)", fontsize=12)
        self.ax_rate.legend()
        self.ax_rate.grid(True, linestyle="--", alpha=0.6)
        
        self.root.after(100, self.update_plots)
        
    def refresh_ports(self):
        self.cb_ports['values'] = [p.device for p in serial.tools.list_ports.comports()]
        if self.cb_ports['values']: self.cb_ports.current(0)
        
    def toggle_connection(self):
        if self.is_running:
            self.is_running = False
            if self.serial_port:
                self.serial_port.close()
            self.btn_connect.config(text="CONNECT", bg="gray")
        else:
            port = self.cb_ports.get()
            if not port: return
            try:
                self.serial_port = serial.Serial(port, 115200, timeout=0.1)
                self.is_running = True
                self.btn_connect.config(text="DISCONNECT", bg="red")
                
                # Reseting time 
                self.start_time = time.time()
                self.times.clear()
                self.yaws.clear()
                self.pitches.clear()
                self.yaw_rates.clear()
                self.pitch_rates.clear()
                
                threading.Thread(target=self.rx_loop, daemon=True).start()
                threading.Thread(target=self.tx_loop, daemon=True).start()
            except Exception as e:
                print("Connection Failed:", e)

    def rx_loop(self):
        buffer = bytearray()
        while self.is_running and self.serial_port.is_open:
            try:
                data = self.serial_port.read(100)
                if data:
                    buffer.extend(data)
                    while len(buffer) >= 24:
                        if buffer[0] == 0xAA and buffer[1] == 0xCC:
                            frame = buffer[:24]
                            exp_crc = get_crc16(frame, 22)
                            rcv_crc = frame[22] | (frame[23] << 8)
                            
                            if exp_crc == rcv_crc:
                                up = struct.unpack('<hhhhhhBBBBBBh', frame[2:22])
                                ax=up[0]/100.0; ay=up[1]/100.0
                                rx=up[2]/100.0; ry=up[3]/100.0
                                xp=up[4]; yp=up[5]
                                temp=up[6]; cam=up[7]; ipu=up[8]
                                tw=up[9]*10; th=up[10]*10; zm=up[12]
                                
                                state = ipu & 0x7 
                                find = (ipu >> 3) & 0x7 
                                lock = (ipu >> 6) & 0x1 
                                
                                # Process GUI interaction in main thread safely
                                self.root.after(0, self.update_rx_ui, ax, ay, rx, ry, xp, yp, tw, th, temp, zm, cam, lock, state, find)
                                
                                # Add point into graph collection
                                t = time.time() - self.start_time
                                self.times.append(t)
                                self.yaws.append(ax)
                                self.pitches.append(ay)
                                self.yaw_rates.append(rx)
                                self.pitch_rates.append(ry)
                                
                            buffer = buffer[24:]
                        else:
                            buffer.pop(0)
            except Exception as e:
                print("RX Error:", e)
                break
                
    def update_rx_ui(self, ax, ay, rx, ry, xp, yp, tw, th, temp, zm, cam, lock, state, find):
        self.rx_vars["Yaw (°)"].set(f"{ax:.2f}")
        self.rx_vars["Pitch (°)"].set(f"{ay:.2f}")
        self.rx_vars["Yaw Rate"].set(f"{rx:.2f}")
        self.rx_vars["Pitch Rate"].set(f"{ry:.2f}")
        self.rx_vars["Target X"].set(str(xp))
        self.rx_vars["Target Y"].set(str(yp))
        self.rx_vars["Target Width"].set(str(tw))
        self.rx_vars["Target Height"].set(str(th))
        self.rx_vars["CPU Temp (°C)"].set(str(temp))
        self.rx_vars["Zoom"].set(str(zm))
        
        self.led_cam.set_state(cam == 1)
        self.led_lock.set_state(lock == 1)
        
        s_arr = ["None", "Idle", "Search", "Track"]
        self.var_ipu_state.set(s_arr[state] if state < len(s_arr) else str(state))
        self.var_targets.set(str(find))

    def toggle_tx(self):
        self.is_tx_enabled = not self.is_tx_enabled
        if self.is_tx_enabled:
            self.btn_tx.config(text="STOP TX", bg="red")
        else:
            self.btn_tx.config(text="START TX", bg="green")

    def tx_loop(self):
        while self.is_running and self.serial_port.is_open:
            try:
                if not self.is_tx_enabled:
                    time.sleep(0.05)
                    continue
                    
                frame = bytearray(20)
                frame[0] = 0x55
                frame[1] = 0xAA
                frame[2] = self.tx_vars["Stab_Mode"].get() & 0xFF
                frame[3] = self.tx_vars["Camera_Mode"].get() & 0xFF
                
                yr = int(self.tx_vars["TX_Yaw"].get() * 100) & 0xFFFF
                pr = int(self.tx_vars["TX_Pitch"].get() * 100) & 0xFFFF
                
                # تجميع البتات لتكوين المتغير ctrl
                cmd_bits = self.tx_vars["Ctrl_Cmd"].get() & 0x07
                fire_bit = (self.tx_vars["Ctrl_Fire"].get() & 0x01) << 4
                link_bit = (self.tx_vars["Ctrl_Link"].get() & 0x01) << 5
                ctrl = cmd_bits | fire_bit | link_bit
                
                ts = int(time.time()*1000) & 0xFFFFFFFF
                
                bp = struct.pack('<hhBIBBBBB', yr, pr, ctrl, ts, 0, 0, 0, 0, 0)
                frame[4:18] = bp
                
                crc = get_crc16(frame, 18)
                frame[18] = crc & 0xFF
                frame[19] = (crc >> 8) & 0xFF
                
                self.serial_port.write(frame)
                time.sleep(0.05) # Loop at 20Hz
            except Exception as e:
                print("TX Error:", e)
                break

    def update_plots(self):
        if self.is_running and len(self.times) > 1:
            try:
                self.line_yaw.set_data(self.times, self.yaws)
                self.line_pitch.set_data(self.times, self.pitches)
                self.ax_pos.relim()
                self.ax_pos.autoscale_view()
                
                self.line_yr.set_data(self.times, self.yaw_rates)
                self.line_pr.set_data(self.times, self.pitch_rates)
                self.ax_rate.relim()
                self.ax_rate.autoscale_view()
                
                self.canvas.draw()
            except Exception:
                pass
        self.root.after(100, self.update_plots)

    def on_closing(self):
        self.is_running = False
        if self.serial_port:
            self.serial_port.close()
        self.root.quit()
        self.root.destroy()
        
if __name__ == '__main__':
    root = tk.Tk()
    app = AdvancedTelemetryGCS(root)
    root.mainloop()
