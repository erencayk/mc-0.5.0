#!/usr/bin/env python3
"""Writes ios/PocketCraft.xcodeproj (project.pbxproj + shared scheme) with deterministic object IDs."""
import hashlib
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PROJ = os.path.join(ROOT, 'ios', 'PocketCraft.xcodeproj')


def oid(name):
    return hashlib.md5(name.encode()).hexdigest()[:24].upper()


SWIFT = ['AppDelegate.swift', 'SceneDelegate.swift', 'GameViewController.swift', 'NativeBridge.swift']
I = {k: oid(k) for k in [
    'project', 'target', 'mainGroup', 'appGroup', 'productsGroup', 'product', 'plist', 'assets', 'www',
    'sources', 'resources', 'frameworks', 'projCfgList', 'tgtCfgList', 'projDebug', 'projRelease', 'tgtDebug', 'tgtRelease',
    'bf_assets', 'bf_www'] + ['fr_' + s for s in SWIFT] + ['bf_' + s for s in SWIFT]}

common = {
    'ALWAYS_SEARCH_USER_PATHS': 'NO',
    'CLANG_ENABLE_MODULES': 'YES',
    'CLANG_ENABLE_OBJC_ARC': 'YES',
    'COPY_PHASE_STRIP': 'NO',
    'ENABLE_STRICT_OBJC_MSGSEND': 'YES',
    'GCC_C_LANGUAGE_STANDARD': 'gnu11',
    'IPHONEOS_DEPLOYMENT_TARGET': '14.0',
    'SDKROOT': 'iphoneos',
    'SWIFT_VERSION': '5.0',
}
debug = dict(common, **{'DEBUG_INFORMATION_FORMAT': 'dwarf', 'ENABLE_TESTABILITY': 'YES', 'GCC_OPTIMIZATION_LEVEL': '0',
                        'ONLY_ACTIVE_ARCH': 'YES', 'SWIFT_ACTIVE_COMPILATION_CONDITIONS': 'DEBUG', 'SWIFT_OPTIMIZATION_LEVEL': '"-Onone"'})
release = dict(common, **{'DEBUG_INFORMATION_FORMAT': '"dwarf-with-dsym"', 'SWIFT_COMPILATION_MODE': 'wholemodule',
                          'SWIFT_OPTIMIZATION_LEVEL': '"-O"', 'VALIDATE_PRODUCT': 'YES'})
target = {
    'ASSETCATALOG_COMPILER_APPICON_NAME': 'AppIcon',
    'CODE_SIGN_STYLE': 'Automatic',
    'CURRENT_PROJECT_VERSION': '50',
    'DEVELOPMENT_TEAM': '""',
    'ENABLE_USER_SCRIPT_SANDBOXING': 'NO',
    'GENERATE_INFOPLIST_FILE': 'NO',
    'INFOPLIST_FILE': 'PocketCraft/Info.plist',
    'LD_RUNPATH_SEARCH_PATHS': '"$(inherited) @executable_path/Frameworks"',
    'MARKETING_VERSION': '0.5.0',
    'PRODUCT_BUNDLE_IDENTIFIER': 'com.pocketcraft.pe050',
    'PRODUCT_NAME': '"$(TARGET_NAME)"',
    'SUPPORTS_MACCATALYST': 'NO',
    'SWIFT_EMIT_LOC_STRINGS': 'NO',
    'TARGETED_DEVICE_FAMILY': '"1,2"',
}


def settings(d, indent='\t\t\t\t'):
    return ''.join(f'{indent}{k} = {v};\n' for k, v in sorted(d.items()))


def build():
    o = []
    o.append('// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {\n\t};\n\tobjectVersion = 56;\n\tobjects = {\n')
    o.append('\n/* Begin PBXBuildFile section */\n')
    for s in SWIFT:
        o.append(f'\t\t{I["bf_" + s]} /* {s} in Sources */ = {{isa = PBXBuildFile; fileRef = {I["fr_" + s]} /* {s} */; }};\n')
    o.append(f'\t\t{I["bf_assets"]} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; fileRef = {I["assets"]} /* Assets.xcassets */; }};\n')
    o.append(f'\t\t{I["bf_www"]} /* www in Resources */ = {{isa = PBXBuildFile; fileRef = {I["www"]} /* www */; }};\n')
    o.append('/* End PBXBuildFile section */\n\n/* Begin PBXFileReference section */\n')
    o.append(f'\t\t{I["product"]} /* PocketCraft.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = PocketCraft.app; sourceTree = BUILT_PRODUCTS_DIR; }};\n')
    for s in SWIFT:
        o.append(f'\t\t{I["fr_" + s]} /* {s} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {s}; sourceTree = "<group>"; }};\n')
    o.append(f'\t\t{I["plist"]} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};\n')
    o.append(f'\t\t{I["assets"]} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; }};\n')
    o.append(f'\t\t{I["www"]} /* www */ = {{isa = PBXFileReference; lastKnownFileType = folder; name = www; path = ../www; sourceTree = SOURCE_ROOT; }};\n')
    o.append('/* End PBXFileReference section */\n\n/* Begin PBXFrameworksBuildPhase section */\n')
    o.append(f'\t\t{I["frameworks"]} /* Frameworks */ = {{\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n')
    o.append('/* End PBXFrameworksBuildPhase section */\n\n/* Begin PBXGroup section */\n')
    o.append(f'\t\t{I["mainGroup"]} = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{I["appGroup"]} /* PocketCraft */,\n\t\t\t\t{I["www"]} /* www */,\n\t\t\t\t{I["productsGroup"]} /* Products */,\n\t\t\t);\n\t\t\tsourceTree = "<group>";\n\t\t}};\n')
    kids = ''.join(f'\t\t\t\t{I["fr_" + s]} /* {s} */,\n' for s in SWIFT)
    o.append(f'\t\t{I["appGroup"]} /* PocketCraft */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n{kids}\t\t\t\t{I["assets"]} /* Assets.xcassets */,\n\t\t\t\t{I["plist"]} /* Info.plist */,\n\t\t\t);\n\t\t\tpath = PocketCraft;\n\t\t\tsourceTree = "<group>";\n\t\t}};\n')
    o.append(f'\t\t{I["productsGroup"]} /* Products */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{I["product"]} /* PocketCraft.app */,\n\t\t\t);\n\t\t\tname = Products;\n\t\t\tsourceTree = "<group>";\n\t\t}};\n')
    o.append('/* End PBXGroup section */\n\n/* Begin PBXNativeTarget section */\n')
    o.append(f'''\t\t{I["target"]} /* PocketCraft */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I["tgtCfgList"]} /* Build configuration list for PBXNativeTarget "PocketCraft" */;
\t\t\tbuildPhases = (
\t\t\t\t{I["sources"]} /* Sources */,
\t\t\t\t{I["frameworks"]} /* Frameworks */,
\t\t\t\t{I["resources"]} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = PocketCraft;
\t\t\tproductName = PocketCraft;
\t\t\tproductReference = {I["product"]} /* PocketCraft.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
''')
    o.append('/* End PBXNativeTarget section */\n\n/* Begin PBXProject section */\n')
    o.append(f'''\t\t{I["project"]} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1500;
\t\t\t\tLastUpgradeCheck = 1500;
\t\t\t\tTargetAttributes = {{
\t\t\t\t\t{I["target"]} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;
\t\t\t\t\t}};
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {I["projCfgList"]} /* Build configuration list for PBXProject "PocketCraft" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {I["mainGroup"]};
\t\t\tproductRefGroup = {I["productsGroup"]} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{I["target"]} /* PocketCraft */,
\t\t\t);
\t\t}};
''')
    o.append('/* End PBXProject section */\n\n/* Begin PBXResourcesBuildPhase section */\n')
    o.append(f'\t\t{I["resources"]} /* Resources */ = {{\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t\t{I["bf_assets"]} /* Assets.xcassets in Resources */,\n\t\t\t\t{I["bf_www"]} /* www in Resources */,\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n')
    o.append('/* End PBXResourcesBuildPhase section */\n\n/* Begin PBXSourcesBuildPhase section */\n')
    files = ''.join(f'\t\t\t\t{I["bf_" + s]} /* {s} in Sources */,\n' for s in SWIFT)
    o.append(f'\t\t{I["sources"]} /* Sources */ = {{\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n{files}\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n')
    o.append('/* End PBXSourcesBuildPhase section */\n\n/* Begin XCBuildConfiguration section */\n')
    for key, name, s in [('projDebug', 'Debug', debug), ('projRelease', 'Release', release), ('tgtDebug', 'Debug', target), ('tgtRelease', 'Release', target)]:
        o.append(f'\t\t{I[key]} /* {name} */ = {{\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {{\n{settings(s)}\t\t\t}};\n\t\t\tname = {name};\n\t\t}};\n')
    o.append('/* End XCBuildConfiguration section */\n\n/* Begin XCConfigurationList section */\n')
    o.append(f'\t\t{I["projCfgList"]} /* Build configuration list for PBXProject "PocketCraft" */ = {{\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t{I["projDebug"]} /* Debug */,\n\t\t\t\t{I["projRelease"]} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t}};\n')
    o.append(f'\t\t{I["tgtCfgList"]} /* Build configuration list for PBXNativeTarget "PocketCraft" */ = {{\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t{I["tgtDebug"]} /* Debug */,\n\t\t\t\t{I["tgtRelease"]} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t}};\n')
    o.append('/* End XCConfigurationList section */\n\t};\n')
    o.append(f'\trootObject = {I["project"]} /* Project object */;\n}}\n')
    return ''.join(o)


SCHEME = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1500" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "{I["target"]}" BuildableName = "PocketCraft.app" BlueprintName = "PocketCraft" ReferencedContainer = "container:PocketCraft.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction buildConfiguration = "Release" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "{I["target"]}" BuildableName = "PocketCraft.app" BlueprintName = "PocketCraft" ReferencedContainer = "container:PocketCraft.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
'''

if __name__ == '__main__':
    os.makedirs(os.path.join(PROJ, 'xcshareddata', 'xcschemes'), exist_ok=True)
    with open(os.path.join(PROJ, 'project.pbxproj'), 'w') as f:
        f.write(build())
    with open(os.path.join(PROJ, 'xcshareddata', 'xcschemes', 'PocketCraft.xcscheme'), 'w') as f:
        f.write(SCHEME)
    print('wrote', PROJ)
