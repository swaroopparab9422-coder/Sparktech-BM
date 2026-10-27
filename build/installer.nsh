; Opens the sync port (TCP 48765) for devices on the same local network, so Windows does not ask or block it.
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Manufacturing Business Manager Sync"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Manufacturing Business Manager Sync" dir=in action=allow protocol=TCP localport=48765 remoteip=LocalSubnet profile=any'
!macroend
!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Manufacturing Business Manager Sync"'
!macroend
