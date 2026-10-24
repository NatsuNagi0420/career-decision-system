# Fetch arXiv abs pages and print verified metadata + abstract.
# Usage: pwsh -File fetch_arxiv.ps1 2406.12045 2304.09848
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Ids)
$h = @{ "User-Agent" = "Mozilla/5.0 (lit-review; academic use)" }
foreach ($id in $Ids) {
    $u = "https://arxiv.org/abs/$id"
    try {
        $r = Invoke-WebRequest -Uri $u -Headers $h -TimeoutSec 60 -UseBasicParsing
        $c = $r.Content
        $title = ([regex]::Match($c, '<meta name="citation_title" content="([^"]*)"')).Groups[1].Value
        $date = ([regex]::Match($c, '<meta name="citation_date" content="([^"]*)"')).Groups[1].Value
        $authors = ([regex]::Matches($c, '<meta name="citation_author" content="([^"]*)"') | ForEach-Object { $_.Groups[1].Value }) -join "; "
        $doi = ([regex]::Match($c, '<meta name="citation_doi" content="([^"]*)"')).Groups[1].Value
        $jref = ([regex]::Match($c, '<meta name="citation_journal_title" content="([^"]*)"')).Groups[1].Value
        $abs = [regex]::Match($c, '(?s)<blockquote class="abstract mathjax">(.*?)</blockquote>').Groups[1].Value
        $abs = ($abs -replace '<[^>]+>', ' ') -replace '\s+', ' '
        $abs = $abs -replace '^\s*Abstract:\s*', ''
        $comments = [regex]::Match($c, '(?s)<td class="tablecell comments[^"]*">(.*?)</td>').Groups[1].Value
        $comments = ($comments -replace '<[^>]+>', ' ') -replace '\s+', ' '
        Write-Output "===== $id"
        Write-Output "TITLE: $title"
        Write-Output "DATE: $date"
        Write-Output "AUTHORS: $authors"
        Write-Output "DOI: $doi"
        Write-Output "JREF: $jref"
        Write-Output "COMMENTS: $comments"
        Write-Output "ABS_LEN: $($abs.Length)"
        Write-Output "ABSTRACT: $abs"
        Write-Output ""
    }
    catch {
        Write-Output "===== $id"
        Write-Output "FAIL: $($_.Exception.Message)"
        Write-Output ""
    }
    Start-Sleep -Seconds 3
}
