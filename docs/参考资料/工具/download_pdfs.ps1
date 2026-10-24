# Download PDFs, verify %PDF magic, never leave a fake file behind.
param([switch]$Force)
$dir = "D:\Project\career-decision-system\docs\参考资料\03_LLM职业咨询与Agent评测"
$h = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"; "Accept" = "application/pdf,*/*" }
$items = @(
    @{ f = "01_职业规划对话代理用户研究.pdf"; u = "https://dl.acm.org/doi/pdf/10.1145/3702163.3702409" },
    @{ f = "02_AI个人建议RCT.pdf";            u = "https://arxiv.org/pdf/2511.15352" },
    @{ f = "03_简历匹配观察研究.pdf";          u = "https://aclanthology.org/2025.findings-naacl.270.pdf" },
    @{ f = "04_简历筛选偏见审计.pdf";          u = "https://arxiv.org/pdf/2407.20371" },
    @{ f = "05_ALCE引文评测.pdf";             u = "https://arxiv.org/pdf/2305.14627" },
    @{ f = "06_生成式搜索可核验性.pdf";        u = "https://arxiv.org/pdf/2304.09848" },
    @{ f = "07_SAFE长文事实性.pdf";           u = "https://arxiv.org/pdf/2403.18802" },
    @{ f = "08_SimpleQA短问答事实性.pdf";      u = "https://arxiv.org/pdf/2411.04368" },
    @{ f = "09_AbstentionBench弃答.pdf";      u = "https://arxiv.org/pdf/2506.09038" },
    @{ f = "10_黑盒置信度校准.pdf";            u = "https://arxiv.org/pdf/2306.13063" },
    @{ f = "11_taubench一致性.pdf";           u = "https://arxiv.org/pdf/2406.12045" },
    @{ f = "12_不确定表达与用户依赖.pdf";      u = "https://arxiv.org/pdf/2401.06730" },
    @{ f = "13_解释降低过度依赖.pdf";          u = "https://arxiv.org/pdf/2212.06823" },
    @{ f = "14_可解释性未缓解错误采纳.pdf";    u = "https://www.nature.com/articles/s41598-024-60220-5.pdf" }
)
foreach ($it in $items) {
    $out = Join-Path $dir $it.f
    if ((Test-Path $out) -and -not $Force -and (Get-Item $out).Length -gt 20000) { Write-Output "SKIP $($it.f)"; continue }
    try {
        Invoke-WebRequest -Uri $it.u -OutFile $out -Headers $h -TimeoutSec 120 -UseBasicParsing
        $bytes = [System.IO.File]::ReadAllBytes($out)
        $magic = [System.Text.Encoding]::ASCII.GetString($bytes[0..3])
        if ($magic -ne "%PDF") {
            Write-Output "BAD  $($it.f) magic='$magic' size=$($bytes.Length) url=$($it.u)"
            Remove-Item $out -Force
        }
        else { Write-Output "OK   $($it.f) $([math]::Round($bytes.Length/1024))KB" }
    }
    catch {
        Write-Output "FAIL $($it.f) => $($_.Exception.Message)"
        if (Test-Path $out) { Remove-Item $out -Force }
    }
    Start-Sleep -Seconds 3
}
