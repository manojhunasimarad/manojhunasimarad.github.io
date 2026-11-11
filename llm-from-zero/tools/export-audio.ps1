param([string]$Only = '', [string]$Voice = '', [int]$Rate = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$courseRoot = Split-Path -Parent $PSScriptRoot
$audioRoot = Join-Path $courseRoot 'audio'
New-Item -ItemType Directory -Force -Path $audioRoot | Out-Null
$studio = Get-Content -LiteralPath (Join-Path $courseRoot 'content/studio.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$course = Get-Content -LiteralPath (Join-Path $courseRoot 'content/lessons.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Convert-LessonText([string]$html) {
  $text = [regex]::Replace($html, '<pre\b[^>]*>[\s\S]*?</pre>', ' Code example omitted from audio. Review it on your laptop. ', 'IgnoreCase')
  $text = [regex]::Replace($text, '<[^>]+>', ' ')
  return [regex]::Replace([System.Net.WebUtility]::HtmlDecode($text), '\s+', ' ').Trim()
}
$episodes = @($studio.episodes | ForEach-Object { [pscustomobject]@{id=$_.id;title=$_.title;text=$_.text} })
$episodes += @($course.lessons | ForEach-Object { [pscustomobject]@{id=$_.id;title=$_.title;text=($_.title + '. ' + (Convert-LessonText $_.html) + '. Pause and recall the main idea. Code and formula details should be reviewed on the laptop.')} })
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = $Rate
if ($Voice) { $synth.SelectVoice($Voice) }
Write-Output ('Using installed voice: ' + $synth.Voice.Name)
try {
  foreach ($episode in $episodes) {
    if ($Only -and $episode.id -ne $Only) { continue }
    if ($episode.id -notmatch '^[a-z0-9-]+$') { throw 'Invalid episode ID' }
    $wav = Join-Path $audioRoot ($episode.id + '.wav')
    $transcript = Join-Path $audioRoot ($episode.id + '.txt')
    [System.IO.File]::WriteAllText($transcript, $episode.text, [System.Text.Encoding]::UTF8)
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($episode.text)
    $synth.SetOutputToNull()
    Write-Output ('Created ' + $episode.id + '.wav')
  }
  $existing = @($episodes | Where-Object { Test-Path -LiteralPath (Join-Path $audioRoot ($_.id + '.wav')) })
  $playlist = @('#EXTM3U') + @($existing | ForEach-Object { '#EXTINF:-1,' + $_.title; $_.id + '.wav' })
  [System.IO.File]::WriteAllLines((Join-Path $audioRoot 'playlist.m3u'), $playlist, [System.Text.Encoding]::UTF8)
  $links = @($existing | ForEach-Object { '<li><a href="' + $_.id + '.wav">' + [System.Net.WebUtility]::HtmlEncode($_.title) + '</a></li>' }) -join "`n"
  $index = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LLM From Zero audio</title><h1>Your offline audio library</h1><p>Generated locally with an installed Windows voice. Copy this folder to Android. Open playlist.m3u in a media player, or select a WAV file. Prepare playback while parked.</p><ul>' + $links + '</ul><p>Course narrations omit code blocks. Review code, equations and tables on your laptop.</p></html>'
  [System.IO.File]::WriteAllText((Join-Path $audioRoot 'index.html'), $index, [System.Text.Encoding]::UTF8)
} finally { $synth.Dispose() }
