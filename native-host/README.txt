AoE4 Replay Launcher - Native Host
====================================

This is the native component for the AoE4 Replay Launcher
Chrome/Edge extension. It downloads and launches AoE4 replays
when you click "Watch Replay" on aoe4world.com.

INSTALL
-------
1. Extract this zip anywhere
2. Double-click install.bat
3. Enter your extension ID when prompted
   (find it at chrome://extensions or edge://extensions)
4. Done! Go to aoe4world.com and click "Watch Replay" on any game.

Files are installed to %LOCALAPPDATA%\AoE4ReplayLauncher.

DEEP LINKS (aoe4rep://)
----------------------
Installing also registers an "aoe4rep://" URL protocol so replays can be
launched from outside the browser. Opening a link of the form:

    aoe4rep://m/243976528

(from a browser, Discord, a shortcut, or `start aoe4rep://m/243976528`)
downloads that match's replay and launches it in AoE4 - the same flow as
the "Watch Replay" button. Protocol activity is logged to
%LOCALAPPDATA%\AoE4ReplayLauncher\protocol.log.

UNINSTALL
---------
Double-click uninstall.bat, then delete this folder.

WHAT'S IN HERE
--------------
install.bat              - Install the native host
uninstall.bat            - Remove the native host
aoe4_replay_setup.ps1    - Creates host files and registers with Chrome/Edge
README.txt               - You're reading it

Everything is plain text and auditable. No compiled binaries.
Source: https://github.com/spartain-aoe/aoe4world-replay-extension
