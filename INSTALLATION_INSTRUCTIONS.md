### Installation Instructions

**Windows (x64)**

1.  Run the `.msi` or `.exe` installer file to begin the installation.

-----

**macOS (Apple Silicon)**

1.  **Mount the DMG File**: Double-click the `Chatless.dmg` file to open it.
2.  **Copy to Applications**: Drag the `Chatless.app` icon into your `Applications` folder.
3.  **Remove Quarantine Attribute**:
      * Open the **Terminal** app (you can find it in `Applications -> Utilities`).
      * Copy and paste the following command, then press **Enter**:
        ```bash
        sudo xattr -r -d com.apple.quarantine /Applications/Chatless.app
        ```
      * You will be prompted to enter your password. Type it and press **Enter** (note: you won't see the characters as you type).
4.  **Launch**: You can now launch Chatless from your Applications folder.

-----

### Notes

  * Support for other platforms is planned for future releases.
  * You can also build the application from the source code by following the instructions in the repository.
