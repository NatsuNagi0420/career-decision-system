# 青穗集 · Agent 验证入口：Windows 自动包含原生实测；脚本模型不代表真实模型，Docker 需显式开启。
[CmdletBinding()]
param([switch]$WithDocker, [switch]$SkipBuild)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Log=Join-Path $Root 'logs\agent-foundation-implementation-20261020'
New-Item -ItemType Directory -Path $Log -Force | Out-Null
$Npm=(Get-Command npm.cmd).Source
$Results=@()
$OldDocker=$env:AGENT_TEST_DOCKER
try {
  if($WithDocker){$env:AGENT_TEST_DOCKER='1'}else{$env:AGENT_TEST_DOCKER=$null}
  $Steps=@(@{name='agent-check';dir='agent';args=@('run','check')},@{name='agent-test-types';dir='agent';args=@('run','check:tests')},@{name='agent-tests';dir='agent';args=@('test')},@{name='web-typecheck';dir='web';args=@('run','typecheck')},@{name='web-tests';dir='web';args=@('test','--','--maxWorkers=2')})
  if(!$SkipBuild){$Steps+=@(@{name='agent-build';dir='agent';args=@('run','build')},@{name='web-build';dir='web';args=@('run','build')})}
  foreach($Step in $Steps){
    $Start=Get-Date;Push-Location -LiteralPath (Join-Path $Root $Step.dir)
    try{$Arguments=$Step.args;& $Npm @Arguments 2>&1 | Tee-Object -LiteralPath (Join-Path $Log ($Step.name+'.log'));$Code=$LASTEXITCODE}finally{Pop-Location}
    $Results+=@{name=$Step.name;exitCode=$Code;durationMs=[int]((Get-Date)-$Start).TotalMilliseconds}
    if($Code -ne 0){throw ($Step.name+' 失败。')}
  }
} finally {
  $env:AGENT_TEST_DOCKER=$OldDocker
  @{recordedAt=[DateTime]::UtcNow.ToString('o');checks=$Results;realLlmVerified=$false;dockerTestRequested=[bool]$WithDocker;nativeIntegrationTestsIncluded=($env:OS -eq 'Windows_NT');nativeBoundary='写入限制；读取、联网和资源硬配额未隔离';note='模型协议和浏览器夹具不是真实模型验收。'} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Log 'verification.json') -Encoding utf8
}
Write-Host "验证通过，日志：$Log"
