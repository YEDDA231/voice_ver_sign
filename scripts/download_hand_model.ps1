# Downloads MediaPipe hand landmarker model required for sign recognition.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$modelsDir = Join-Path $root "models"
$outFile = Join-Path $modelsDir "hand_landmarker.task"
$url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
Write-Host "Downloading hand_landmarker.task ..."
Invoke-WebRequest -Uri $url -OutFile $outFile
Write-Host "Saved to $outFile"
