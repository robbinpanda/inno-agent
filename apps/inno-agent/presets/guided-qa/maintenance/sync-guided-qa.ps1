[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RepositoryRoot,
    [string]$RuntimeDataRoot,
    [string]$WorkspaceRoot,
    [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-NormalizedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
}

function Assert-DescendantPath {
    param(
        [Parameter(Mandatory = $true)][string]$Child,
        [Parameter(Mandatory = $true)][string]$Parent,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $normalizedChild = Get-NormalizedPath $Child
    $normalizedParent = Get-NormalizedPath $Parent
    $parentPrefix = $normalizedParent + [System.IO.Path]::DirectorySeparatorChar
    if (-not $normalizedChild.StartsWith($parentPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label escapes its allowed root: $normalizedChild"
    }
}

function Get-RelativeChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Child
    )

    $normalizedRoot = Get-NormalizedPath $Root
    $normalizedChild = Get-NormalizedPath $Child
    $rootPrefix = $normalizedRoot + [System.IO.Path]::DirectorySeparatorChar
    if (-not $normalizedChild.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is not below root: $normalizedChild"
    }
    return $normalizedChild.Substring($rootPrefix.Length)
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($entry in Get-ChildItem -LiteralPath $Source -Force) {
        Copy-Item -LiteralPath $entry.FullName -Destination $Destination -Recurse -Force
    }
}

function Copy-ManagedPath {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $nativeRelativePath = $RelativePath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $sourcePath = Join-Path $SourceRoot $nativeRelativePath
    $destinationPath = Join-Path $DestinationRoot $nativeRelativePath
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Managed source path is missing: $sourcePath"
    }

    if (Test-Path -LiteralPath $destinationPath) {
        Remove-Item -LiteralPath $destinationPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
}

function Get-FileHashMap {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string[]]$RelativePaths
    )

    $map = @{}
    foreach ($relativePath in $RelativePaths) {
        $nativeRelativePath = $relativePath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $path = Join-Path $Root $nativeRelativePath
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Expected path is missing during verification: $path"
        }

        $item = Get-Item -LiteralPath $path
        $files = if ($item.PSIsContainer) {
            Get-ChildItem -LiteralPath $path -Recurse -File -Force
        } else {
            @($item)
        }
        foreach ($file in $files) {
            $relativeFile = (Get-RelativeChildPath -Root $Root -Child $file.FullName).Replace("\", "/")
            $map[$relativeFile] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
        }
    }
    return $map
}

function Assert-HashMapsEqual {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Expected,
        [Parameter(Mandatory = $true)][hashtable]$Actual,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $expectedKeys = @($Expected.Keys | Sort-Object)
    $actualKeys = @($Actual.Keys | Sort-Object)
    $keyDiff = Compare-Object -ReferenceObject $expectedKeys -DifferenceObject $actualKeys
    if ($keyDiff) {
        $details = ($keyDiff | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }) -join "; "
        throw "$Label file set mismatch: $details"
    }
    foreach ($key in $expectedKeys) {
        if ($Expected[$key] -ne $Actual[$key]) {
            throw "$Label hash mismatch: $key"
        }
    }
}

$sourceRoot = Get-NormalizedPath (Join-Path $PSScriptRoot "..")
$derivedRepositoryRoot = Get-NormalizedPath (Join-Path $sourceRoot "..\..\..\..")
$resolvedRepositoryRoot = Get-NormalizedPath $(if ($RepositoryRoot) { $RepositoryRoot } else { $derivedRepositoryRoot })
$resolvedRuntimeDataRoot = Get-NormalizedPath $(if ($RuntimeDataRoot) { $RuntimeDataRoot } else { Join-Path $resolvedRepositoryRoot "runtime\data" })
$resolvedWorkspaceRoot = Get-NormalizedPath $(if ($WorkspaceRoot) { $WorkspaceRoot } else { Join-Path $resolvedRepositoryRoot "workspace" })

Assert-DescendantPath -Child $sourceRoot -Parent $resolvedRepositoryRoot -Label "Preset source"

$manifestPath = Join-Path $sourceRoot "release.json"
$presetPath = Join-Path $sourceRoot "preset.json"
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $presetPath)) {
    throw "guided-qa release.json or preset.json is missing"
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$preset = Get-Content -Raw -Encoding UTF8 -LiteralPath $presetPath | ConvertFrom-Json
if ($manifest.presetId -ne "guided-qa" -or $preset.id -ne "guided-qa") {
    throw "Preset id must be guided-qa"
}
if ($manifest.version -ne $preset.version) {
    throw "Version mismatch between release.json and preset.json"
}

$managedPaths = @($manifest.managedPaths)
$expectedManagedPaths = @(
    "agent.md",
    ".skills/guided-math-tutoring",
    "maintenance",
    "release.json"
)
$managedPathDiff = Compare-Object -ReferenceObject ($expectedManagedPaths | Sort-Object) -DifferenceObject ($managedPaths | Sort-Object)
if ($managedPathDiff) {
    throw "release.json managedPaths differs from the allowed guided-qa set"
}
$preservedWorkspacePaths = @($manifest.preservedWorkspacePaths)
$expectedPreservedWorkspacePaths = @(".chat-images", "learning-cards", "practice")
$preservedPathDiff = Compare-Object -ReferenceObject ($expectedPreservedWorkspacePaths | Sort-Object) -DifferenceObject ($preservedWorkspacePaths | Sort-Object)
if ($preservedPathDiff) {
    throw "release.json preservedWorkspacePaths differs from the protected guided-qa set"
}

$cacheRoot = Get-NormalizedPath (Join-Path $resolvedRuntimeDataRoot "preset-cache\guided-qa")
$workspacePresetRoot = Get-NormalizedPath (Join-Path $resolvedWorkspaceRoot ".presets\guided-qa")
Assert-DescendantPath -Child $cacheRoot -Parent $resolvedRuntimeDataRoot -Label "Preset cache"
Assert-DescendantPath -Child $workspacePresetRoot -Parent $resolvedWorkspaceRoot -Label "Preset workspace"

if (-not $VerifyOnly) {
    if ($PSCmdlet.ShouldProcess($cacheRoot, "Replace guided-qa preset cache from canonical source")) {
        if (Test-Path -LiteralPath $cacheRoot) {
            Remove-Item -LiteralPath $cacheRoot -Recurse -Force
        }
        Copy-DirectoryContents -Source $sourceRoot -Destination $cacheRoot
    }

    if ($PSCmdlet.ShouldProcess($workspacePresetRoot, "Replace guided-qa managed workspace files while preserving learner artifacts")) {
        New-Item -ItemType Directory -Path $workspacePresetRoot -Force | Out-Null
        foreach ($managedPath in $managedPaths) {
            Copy-ManagedPath -SourceRoot $sourceRoot -DestinationRoot $workspacePresetRoot -RelativePath $managedPath
        }
    }
}

if ($WhatIfPreference) {
    [PSCustomObject]@{
        presetId = $manifest.presetId
        version = $manifest.version
        source = $sourceRoot
        cache = $cacheRoot
        workspace = $workspacePresetRoot
        status = "planned"
    }
    return
}

$sourceAllPaths = @(".")
$sourceAllHashes = Get-FileHashMap -Root $sourceRoot -RelativePaths $sourceAllPaths
$cacheAllHashes = Get-FileHashMap -Root $cacheRoot -RelativePaths $sourceAllPaths
Assert-HashMapsEqual -Expected $sourceAllHashes -Actual $cacheAllHashes -Label "Preset cache"

$sourceManagedHashes = Get-FileHashMap -Root $sourceRoot -RelativePaths $managedPaths
$workspaceManagedHashes = Get-FileHashMap -Root $workspacePresetRoot -RelativePaths $managedPaths
Assert-HashMapsEqual -Expected $sourceManagedHashes -Actual $workspaceManagedHashes -Label "Preset workspace"

[PSCustomObject]@{
    presetId = $manifest.presetId
    version = $manifest.version
    source = $sourceRoot
    cache = $cacheRoot
    workspace = $workspacePresetRoot
    managedFiles = $sourceManagedHashes.Count
    cacheFiles = $sourceAllHashes.Count
    status = $(if ($VerifyOnly) { "verified" } else { "synchronized" })
}
