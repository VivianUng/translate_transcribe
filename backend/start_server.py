# # backend/start_server.py
import subprocess
import threading

def stream_output(process, name):
    for line in process.stdout:
        print(f"[{name}] {line.decode().rstrip()}")

processes = {
    "LibreTranslate": subprocess.Popen("libretranslate", shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT),
    "Uvicorn": subprocess.Popen("uvicorn main:app --port 10000", shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT),
    "Ngrok": subprocess.Popen("ngrok http 10000 --log=stdout", shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT),
}

for name, process in processes.items():
    threading.Thread(target=stream_output, args=(process, name), daemon=True).start()

print("All services started. Logs below:\n")

try:
    while True:
        pass
except KeyboardInterrupt:
    print("\nStopping all services...")
    for p in processes.values():
        p.terminate()
