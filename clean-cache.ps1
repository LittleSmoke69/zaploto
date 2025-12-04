# Script para limpar cache do Next.js/Turbopack
Write-Host "Limpando cache do Next.js..." -ForegroundColor Yellow

# Remove pasta .next
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "✓ Pasta .next removida" -ForegroundColor Green
} else {
    Write-Host "✓ Pasta .next não encontrada" -ForegroundColor Gray
}

# Remove cache do node_modules
if (Test-Path "node_modules\.cache") {
    Remove-Item -Recurse -Force "node_modules\.cache"
    Write-Host "✓ Cache do node_modules removido" -ForegroundColor Green
} else {
    Write-Host "✓ Cache do node_modules não encontrado" -ForegroundColor Gray
}

# Remove arquivos temporários do Turbopack
$tempPath = "$env:LOCALAPPDATA\Temp"
$nextPanicFiles = Get-ChildItem -Path $tempPath -Filter "next-panic-*.log" -ErrorAction SilentlyContinue
if ($nextPanicFiles) {
    $nextPanicFiles | Remove-Item -Force
    Write-Host "✓ Arquivos de panic do Turbopack removidos" -ForegroundColor Green
}

Write-Host "`nCache limpo com sucesso! Reinicie o servidor com 'npm run dev'" -ForegroundColor Green

