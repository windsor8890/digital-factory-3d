param(
  [string]$File = "digital-factory-3d.html",
  [string]$Out = "qa-df/shot.png",
  [string]$Query = "instant=1&still=1",
  [int]$W = 1440,
  [int]$H = 900,
  [int]$Budget = 26000
)
$root = "D:\code\vibe-projects-dsh"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" }
$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $root $Out }
$parent = Split-Path -Parent $outPath
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
if (Test-Path $outPath) { Remove-Item -Force $outPath }
$filePath = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $root $File }
$url = "file:///" + ($filePath -replace '\\', '/') + "?" + $Query
$profile = Join-Path $env:TEMP ("dsh_chr_" + [guid]::NewGuid().ToString("N").Substring(0, 10))
& $chrome --headless=new --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --force-device-scale-factor=1 --user-data-dir=$profile --window-size=$W,$H --virtual-time-budget=$Budget --screenshot=$outPath $url 2>$null | Out-Null
Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
if (Test-Path $outPath) { "SAVED $outPath " + (Get-Item $outPath).Length + " bytes" } else { "NO FILE — chrome failed" }
