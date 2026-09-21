# Deploying Blast Radius

## Read this first — one correction that costs people their last weekend

You **cannot** host this app on Nebius Token Factory.

- Token Factory **dedicated endpoints serve model weights only**, not arbitrary containers.
- Token Factory **Sandboxes expose no inbound ports and no preview URLs** — they are for running
  code, not for serving it.

There is advice circulating that says "deploy your dashboard as a Nebius Serverless Endpoint."
It does not work. Budget zero hours on it.

**Nebius AI Cloud is a different product and it does host containers** — Managed Kubernetes and
plain VMs. That is where the app goes. The hackathon rule is "runs on Nebius Token Factory *or*
Nebius AI Cloud", so either satisfies eligibility; using both is the strongest story:

| Piece | Where |
|---|---|
| Nemotron inference | Nebius **Token Factory** (satisfies the NVIDIA-open-model rule on its own) |
| Sandbox execution + forking | Nebius **Token Factory Sandboxes** |
| API + operator console | Nebius **AI Cloud** — a small CPU VM |
| Batch scenario recording | Optional: Nebius **Serverless Jobs** |

---

## Option A — Nebius AI Cloud VM (recommended, ~40 minutes)

This is the one to do. It keeps the whole stack on Nebius, which is a real point on the
Technological Implementation criterion, and it needs no Kubernetes knowledge.

**1. Create the VM.** Console → Compute → create instance. A 2 vCPU / 4 GB CPU instance is
plenty — no GPU, all inference is remote. Ubuntu 24.04. Add your SSH key. Open port 80.

**2. Install.**

```bash
ssh ubuntu@<vm-ip>
sudo apt update && sudo apt install -y python3-venv git nginx
git clone https://github.com/<you>/blast-radius.git && cd blast-radius
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env && nano .env        # paste NEBIUS_API_KEY and TAVILY_API_KEY
python scripts/smoke.py                  # confirm it works here too
```

**3. Run it as a service** so it survives your SSH session and a reboot:

```bash
sudo tee /etc/systemd/system/blastradius.service >/dev/null <<'EOF'
[Unit]
Description=Blast Radius
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/blast-radius
EnvironmentFile=/home/ubuntu/blast-radius/.env
ExecStart=/home/ubuntu/blast-radius/.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload && sudo systemctl enable --now blastradius
sudo systemctl status blastradius --no-pager
```

**4. Put nginx in front** so judges hit port 80, not :8000:

```bash
sudo tee /etc/nginx/sites-available/default >/dev/null <<'EOF'
server {
    listen 80 default_server;
    client_max_body_size 8m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }
}
EOF
sudo nginx -t && sudo systemctl restart nginx
```

**5. Record the traces on the VM**, so the demo works even when live inference rate-limits:

```bash
cd /home/ubuntu/blast-radius && . .venv/bin/activate
python scripts/record.py --all
```

**6. Verify like a judge would.** Open `http://<vm-ip>/` in a private window. You must reach a
working console with recorded runs visible in under 20 seconds, with no login and no API key.
If there is a signup wall, you score a 4 on Design no matter how good the engineering is.

**HTTPS (optional but nicer).** Point a cheap domain at the VM and run
`sudo snap install --classic certbot && sudo certbot --nginx`. Some corporate networks block
plain HTTP; a judge on one of those sees nothing.

---

## Option B — Nebius Managed Kubernetes

Only if you already know k8s. It is not worth learning for this.

```bash
docker build -t cr.eu-north1.nebius.cloud/<registry>/blast-radius:1.0 .
docker push cr.eu-north1.nebius.cloud/<registry>/blast-radius:1.0

kubectl create secret generic blastradius-env \
  --from-literal=NEBIUS_API_KEY=... --from-literal=TAVILY_API_KEY=...
kubectl apply -f k8s.yaml
kubectl get svc blast-radius     # take the external IP
```

`k8s.yaml` is in this repo. It is a single Deployment plus a LoadBalancer Service with a
PersistentVolumeClaim for the SQLite file.

---

## Option C — fallback only

If you are behind on the last weekend, put the app on any host that gives you a URL and keep the
models on Token Factory. You remain eligible. Say plainly in the README that inference runs on
Nebius Token Factory and the UI is hosted elsewhere — do not imply more than is true. An
overclaim a judge catches discounts everything else on the page.

---

## Pre-submission verification

Do all of these from a device that has never seen the project:

- [ ] `http://<host>/` loads in under 20 seconds, no signup, no key
- [ ] A recorded run opens from the dropdown and shows the intent/diff split
- [ ] `GET /api/health` returns the three model IDs you claim in the README
- [ ] Rejecting a gate on a live run produces a visible corrected retry
- [ ] The repo is public, `LICENSE` (Apache-2.0) is visible at the root
- [ ] `make smoke` passes on a clean clone with only `.env` filled in
- [ ] The demo URL is in the Devpost submission **and** at the top of the README
