# Print an OpenAlex work (title/year/venue/DOI/authors/abstract) by DOI or work id.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Keys)
$h = @{ "User-Agent" = "lit-review/1.0 (mailto:local@example.com)" }

function Rebuild-Abstract($inv) {
    if ($null -eq $inv) { return "" }
    $pairs = New-Object System.Collections.ArrayList
    foreach ($k in $inv.Keys) {
        foreach ($pos in $inv[$k]) { [void]$pairs.Add([pscustomobject]@{ w = $k; i = [int]$pos }) }
    }
    if ($pairs.Count -eq 0) { return "" }
    return (($pairs | Sort-Object i | ForEach-Object { $_.w }) -join " ")
}

foreach ($k in $Keys) {
    $u = if ($k -match '^W\d+$') { "https://api.openalex.org/works/$k" } else { "https://api.openalex.org/works/doi:$k" }
    Write-Output "===== $k"
    try {
        $r = Invoke-WebRequest -Uri $u -Headers $h -TimeoutSec 45 -UseBasicParsing
        $w = $r.Content | ConvertFrom-Json -AsHashtable
        Write-Output "TITLE: $($w['title'])"
        Write-Output "YEAR: $($w['publication_year'])  DATE: $($w['publication_date'])"
        Write-Output "TYPE: $($w['type'])  CITED: $($w['cited_by_count'])"
        $pk = $w['primary_location']; $src = $pk['source']
        Write-Output "VENUE: $($src['display_name'])  PUBLISHER: $($src['host_organization_name'])"
        Write-Output "DOI: $($w['doi'])"
        $oa = $w['open_access']
        Write-Output "OA: $($oa['is_oa']) $($oa['oa_status']) URL=$($oa['oa_url'])"
        Write-Output "LANDPAGES: $(($w['locations'] | ForEach-Object { $_['landing_page_url'] }) -join ' | ')"
        Write-Output "PDFS: $(($w['locations'] | ForEach-Object { $_['pdf_url'] }) -join ' | ')"
        Write-Output "AUTHORS: $(($w['authorships'] | ForEach-Object { $_['author']['display_name'] }) -join '; ')"
        $ab = Rebuild-Abstract $w['abstract_inverted_index']
        Write-Output "ABS_LEN: $($ab.Length)"
        Write-Output "ABSTRACT: $ab"
    }
    catch { Write-Output "FAIL: $($_.Exception.Message)" }
    Write-Output ""
    Start-Sleep -Seconds 2
}
