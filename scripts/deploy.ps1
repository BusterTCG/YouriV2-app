# Deploy YouriV2-app vers le VPS Hetzner (app.pangeeprod.com).
#
# MÊME VPS que KuroNeko (port + service + DB distincts). L'endpoint SSH reste
# `stan@app.kuronekoprod.com` (DNS déjà résolu vers le VPS) — c'est la même
# machine ; Youri est juste servi sur app.pangeeprod.com / port 3001.
#
# Pipeline (copie du deploy KN) :
#   1. Backup DB pre-deploy (SQLite .backup côté VPS) -> /home/stan/backups
#   2. Tar du code local (exclut node_modules/.next/.env/prisma/*.db/uploads)
#   3. scp -> /tmp sur VPS
#   4. Stop service youri
#   5. Extract over /home/stan/youri (préserve .env, prod.db, public/uploads)
#   6. npm ci (skip puppeteer) + prisma migrate deploy + npm run build
#   7. Start service + health check HTTPS 2xx
#
# PRÉ-REQUIS (one-time, cf. docs/process/vps-deploy.md) : /home/stan/youri créé,
# .env rempli, youri.service installé, google-chrome-stable installé, nginx
# vhost + certbot, DNS app.pangeeprod.com -> VPS. Le 1er déploiement est manuel.
#
# Usage :
#   .\scripts\deploy.ps1
#   .\scripts\deploy.ps1 -SkipBuild   # rapide, juste push code (à éviter en prod)

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$VPS_HOST = "stan@app.kuronekoprod.com"   # même VPS que KN (endpoint SSH résolu)
$VPS_APP_DIR = "/home/stan/youri"
$VPS_TMP = "/tmp/youri-deploy.tar.gz"
$LOCAL_REPO = (Resolve-Path "$PSScriptRoot\..").Path
$TARBALL = "$env:TEMP\youri-deploy.tar.gz"
$HEALTH_URL = "https://app.pangeeprod.com/api/health"

function Log {
    param($Message)
    Write-Host "[$(Get-Date -Format HH:mm:ss)] $Message" -ForegroundColor Cyan
}

function Fail {
    param($Message)
    Write-Host "[$(Get-Date -Format HH:mm:ss)] ERREUR: $Message" -ForegroundColor Red
    exit 1
}

# Execute un script bash sur le VPS via ssh, en passant le script via stdin.
# Fichier temp UTF-8 sans BOM + LF purs (PowerShell ajoute sinon CRLF/BOM).
function Invoke-RemoteBash {
    param(
        [string]$Script,
        [string]$Host_
    )
    $tmpFile = [IO.Path]::GetTempFileName()
    try {
        $cleaned = $Script -replace "`r", ""
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [IO.File]::WriteAllText($tmpFile, $cleaned, $utf8NoBom)
        # EAP=Continue + 2>&1 : les commandes distantes (npm ci…) ecrivent des
        # warnings sur stderr ; sans ca, PS 5.1 les prend pour des erreurs
        # fatales (NativeCommandError) et avorte le deploy en plein build.
        # On verifie le vrai succes via $LASTEXITCODE chez l'appelant.
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        cmd /c "ssh $Host_ `"bash -s`" < `"$tmpFile`" 2>&1"
        $ErrorActionPreference = $prevEAP
    } finally {
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
    }
}

# ───────── 1. Backup DB pre-deploy ─────────
Log "Backup DB pre-deploy sur VPS..."
$preDeployTag = "youri-pre-deploy-$(Get-Date -Format yyyyMMdd-HHmmss)"
$backupCmd = @"
set -e
sqlite3 $VPS_APP_DIR/prisma/prod.db ".backup '/home/stan/backups/$preDeployTag.db'"
gzip /home/stan/backups/$preDeployTag.db
ls -lh /home/stan/backups/$preDeployTag.db.gz
"@
Invoke-RemoteBash -Script $backupCmd -Host_ $VPS_HOST
if ($LASTEXITCODE -ne 0) { Fail "Backup pre-deploy a echoue" }

# ───────── 2. Tar du code ─────────
Log "Creation tarball local..."
if (Test-Path $TARBALL) { Remove-Item $TARBALL }

Push-Location $LOCAL_REPO
try {
    tar `
        --exclude="node_modules" `
        --exclude=".next" `
        --exclude=".env" `
        --exclude=".env.local" `
        --exclude=".env.production" `
        --exclude="prisma/dev.db*" `
        --exclude="prisma/prod.db*" `
        --exclude="public/uploads" `
        --exclude=".git" `
        --exclude="tsconfig.tsbuildinfo" `
        --exclude="backups" `
        -czf $TARBALL `
        .
    if ($LASTEXITCODE -ne 0) { Fail "tar a echoue" }
} finally {
    Pop-Location
}

$tarballSize = [math]::Round((Get-Item $TARBALL).Length / 1MB, 1)
Log "Tarball : $tarballSize MB"

# ───────── 3. Transfer ─────────
Log "Transfer vers VPS..."
scp $TARBALL "${VPS_HOST}:${VPS_TMP}"
if ($LASTEXITCODE -ne 0) { Fail "scp a echoue" }

# ───────── 4-6. Stop + extract + build + start ─────────
Log "Deploy cote VPS (stop, extract, install, migrate, build, start)..."

$skipBuildFlag = if ($SkipBuild) { "1" } else { "0" }
$remoteScript = @"
set -euo pipefail
echo '[VPS] Stop youri.service'
sudo systemctl stop youri

echo '[VPS] Extract + sync code (rsync --delete : retire les fichiers obsoletes/renommes)'
rm -rf /tmp/youri-new
mkdir -p /tmp/youri-new
tar -xzf $VPS_TMP -C /tmp/youri-new
rsync -a --delete --exclude='node_modules' --exclude='.next' --exclude='.env' --exclude='.env.local' --exclude='.env.production' --exclude='prisma/dev.db*' --exclude='prisma/prod.db*' --exclude='public/uploads' --exclude='.git' --exclude='tsconfig.tsbuildinfo' --exclude='backups' /tmp/youri-new/ $VPS_APP_DIR/
rm -rf /tmp/youri-new

echo '[VPS] npm ci (skip puppeteer download)'
cd $VPS_APP_DIR
PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund

echo '[VPS] prisma migrate deploy'
npx prisma migrate deploy

if [ "$skipBuildFlag" = "0" ]; then
    echo '[VPS] Build Next.js (max-old-space-size=3072)'
    NODE_OPTIONS='--max-old-space-size=3072' npm run build
fi

echo '[VPS] Start youri.service'
sudo systemctl start youri
sleep 2
sudo systemctl status youri --no-pager | head -10

echo '[VPS] Cleanup'
rm -f $VPS_TMP
"@

Invoke-RemoteBash -Script $remoteScript -Host_ $VPS_HOST
if ($LASTEXITCODE -ne 0) { Fail "Deploy distant a echoue. Service peut etre arrete. Backup DB : $preDeployTag.db.gz" }

# ───────── 7. Health check ─────────
Log "Health check $HEALTH_URL ..."
Start-Sleep -Seconds 3
$healthScript = "curl -sS -o /dev/null -w '%{http_code}' $HEALTH_URL"
$healthCode = (Invoke-RemoteBash -Script $healthScript -Host_ $VPS_HOST) -join ''
if ($healthCode -match '^\s*[23]\d\d\s*$') {
    Log "OK : HTTP $($healthCode.Trim())"
} else {
    Fail "Health check failed : HTTP '$healthCode'"
}

# Cleanup local
Remove-Item $TARBALL

Log "Deploy reussi. Backup pre-deploy conserve : $preDeployTag.db.gz"
