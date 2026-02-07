# MICRONAUT ORCHESTRATOR (SCO/1 projection only)

$Root = Split-Path $MyInvocation.MyCommand.Path
$IO = Join-Path $Root "io"
$Chat = Join-Path $IO "chat.txt"
$Stream = Join-Path $IO "stream.txt"

Write-Host "Micronaut online."

$lastSize = 0

while ($true) {
    if (Test-Path $Chat) {
        $size = (Get-Item $Chat).Length
        if ($size -gt $lastSize) {

            $entry = Get-Content $Chat -Raw
            $lastSize = $size

            # ---- CM-1 VERIFY ----
            if (Get-Command cm1_verify -ErrorAction SilentlyContinue) {
                if (-not (cm1_verify $entry)) {
                    Write-Host "CM-1 violation"
                    continue
                }
            } else {
                Write-Host "CM-1 verifier unavailable"
                continue
            }

            # ---- SEMANTIC EXTRACTION ----
            if (-not (Get-Command Invoke-KUHUL-TSG -ErrorAction SilentlyContinue)) {
                Write-Host "KUHUL-TSG operator unavailable"
                continue
            }
            $signal = Invoke-KUHUL-TSG -Input $entry

            # ---- INFERENCE (SEALED) ----
            if (-not (Get-Command Invoke-SCXQ2-Infer -ErrorAction SilentlyContinue)) {
                Write-Host "SCXQ2 operator unavailable"
                continue
            }
            $response = Invoke-SCXQ2-Infer -Signal $signal

            # ---- STREAM OUTPUT ----
            Add-Content $Stream ">> $response"
        }
    }
    Start-Sleep -Milliseconds 200
}
