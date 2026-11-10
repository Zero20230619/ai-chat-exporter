# 打包脚本：生成可加载的 Edge 扩展 ZIP
# 用法：powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $root "manifest.json"
$manifestText = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
$manifest = $manifestText | ConvertFrom-Json
$version = $manifest.version
$dist = Join-Path $root "dist"
$stageRoot = Join-Path $dist "stage"
$stageDir = Join-Path $stageRoot "ai-chat-exporter"
$zipPath = Join-Path $dist ("ai-chat-exporter-edge-v" + $version + ".zip")

if (Test-Path $stageRoot) { Remove-Item $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

$files = @("manifest.json", "background.js", "popup.html", "popup.css", "popup.js", "README.md", "LICENSE")
foreach ($file in $files) {
  $source = Join-Path $root $file
  if (Test-Path $source) { Copy-Item $source $stageDir -Force }
}
foreach ($dir in @("src", "icons")) {
  Copy-Item (Join-Path $root $dir) $stageDir -Recurse -Force
}

# README 里引用的截图一并打包，方便解压后直接查看
$docsStage = Join-Path $stageDir "docs"
New-Item -ItemType Directory -Force -Path $docsStage | Out-Null
foreach ($image in @("screenshot-panel.png", "screenshot-popup.png")) {
  $source = Join-Path $root "docs\$image"
  if (Test-Path $source) { Copy-Item $source $docsStage -Force }
}

# 防止把无关目录带进扩展包
$forbidden = @("test", "research", "review", "dist", "node_modules")
foreach ($name in $forbidden) {
  $path = Join-Path $stageDir $name
  if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}

if (-not (Test-Path (Join-Path $stageDir "manifest.json"))) {
  throw "打包失败：stage 目录缺少 manifest.json"
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $stageDir -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $stageRoot -Recurse -Force

$size = [Math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host ""
Write-Host "打包完成：$zipPath" -ForegroundColor Green
Write-Host "文件大小：$size KB"
Write-Host "安装：edge://extensions -> 开发人员模式 -> 加载解压缩的扩展 -> 选择解压后的 ai-chat-exporter 文件夹"
