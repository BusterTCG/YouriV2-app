# Pull du dernier backup SQLite Youri depuis le VPS vers le PC.
# Lancé quotidiennement via Windows Task Scheduler.
#
# Stratégie : ceinture + bretelles
#   - VPS : cron quotidien -> /home/stan/backups/youri-YYYYMMDD-HHMMSS.db.gz
#   - PC  : ce script pull le plus récent .db.gz dans
#           C:\Users\stani\Backups\Youri (rotation 30j côté PC)
#
# Pré-requis :
#   - OpenSSH client Windows (déjà installé car ssh stan@app... fonctionne)
#   - Clé SSH dans %USERPROFILE%\.ssh\id_ed25519
#
# Installation Task Scheduler (à faire une fois) :
#   schtasks /create /tn "Youri Backup" /tr "powershell.exe -ExecutionPolicy Bypass -File C:\Users\stani\Dev\YouriV2-app\scripts\pull-vps-backup.ps1" /sc daily /st 04:45 /f
#
# Test manuel :
#   powershell.exe -ExecutionPolicy Bypass -File .\scripts\pull-vps-backup.ps1

$ErrorActionPreference = "Stop"

$VPS_HOST = "stan@app.kuronekoprod.com"   # même VPS que KN
$VPS_BACKUP_DIR = "/home/stan/backups"
$LOCAL_BACKUP_DIR = "$env:USERPROFILE\Backups\Youri"
$KEEP_DAYS = 30

# 1. Crée le dossier local si besoin
New-Item -ItemType Directory -Force -Path $LOCAL_BACKUP_DIR | Out-Null

# 2. Récupère le nom du dernier dump Youri côté VPS
$latestFile = ssh $VPS_HOST "ls -t $VPS_BACKUP_DIR/youri-*.db.gz 2>/dev/null | head -1"
if (-not $latestFile) {
    Write-Error "Aucun backup Youri trouvé sur le VPS dans $VPS_BACKUP_DIR"
    exit 1
}

$fileName = Split-Path -Leaf $latestFile
$localPath = Join-Path $LOCAL_BACKUP_DIR $fileName

# 3. Skip si déjà téléchargé
if (Test-Path $localPath) {
    Write-Host "[$(Get-Date -Format o)] Deja a jour : $fileName"
} else {
    Write-Host "[$(Get-Date -Format o)] Pull : $fileName"
    scp "${VPS_HOST}:${latestFile}" $localPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "scp a echoue"
        exit 1
    }
    $size = (Get-Item $localPath).Length / 1KB
    Write-Host "[$(Get-Date -Format o)] OK ($([math]::Round($size,1)) KB)"
}

# 4. Rotation locale : supprime les dumps > KEEP_DAYS
$cutoff = (Get-Date).AddDays(-$KEEP_DAYS)
Get-ChildItem -Path $LOCAL_BACKUP_DIR -Filter "youri-*.db.gz" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Write-Host "[$(Get-Date -Format o)] Rotation : suppression $($_.Name)"
        Remove-Item $_.FullName
    }

Write-Host "[$(Get-Date -Format o)] Backup pull termine."
