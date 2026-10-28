// tpkc: Touch ID-gated keychain helper (no entitlements needed).
// Secrets live in the login keychain. Every `get` requires a live Touch ID check
// (device password if no sensor) before the secret is returned. `store` is silent.
// Usage:
//   tpkc store  <service> <account>            # secret read from stdin
//   tpkc get    <service> <account> [reason]
//   tpkc delete <service> <account>
import Foundation
import Security
import LocalAuthentication

func die(_ msg: String, _ code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((msg + "\n").utf8))
    exit(code)
}

func osMsg(_ s: OSStatus) -> String {
    (SecCopyErrorMessageString(s, nil) as String?) ?? "OSStatus \(s)"
}

func base(_ service: String, _ account: String) -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
    ]
}

func requireTouchID(_ reason: String) {
    let ctx = LAContext()
    ctx.localizedFallbackTitle = "Use password"
    var authErr: NSError?
    // Touch ID if available, else device password.
    let policy: LAPolicy = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authErr)
        ? .deviceOwnerAuthenticationWithBiometrics
        : .deviceOwnerAuthentication
    let sem = DispatchSemaphore(value: 0)
    var ok = false
    var failMsg = "authentication failed"
    ctx.evaluatePolicy(policy, localizedReason: reason) { success, error in
        ok = success
        if let e = error { failMsg = e.localizedDescription }
        sem.signal()
    }
    sem.wait()
    if !ok { die("denied: \(failMsg)", 2) }
}

func store(_ service: String, _ account: String) {
    var secret = FileHandle.standardInput.readDataToEndOfFile()
    while let last = secret.last, last == 0x0a || last == 0x0d { secret.removeLast() }
    if secret.isEmpty { die("store: empty secret on stdin") }

    SecItemDelete(base(service, account) as CFDictionary)
    var q = base(service, account)
    q[kSecValueData as String] = secret
    q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let st = SecItemAdd(q as CFDictionary, nil)
    if st != errSecSuccess { die("store failed: \(osMsg(st))") }
    print("stored \(service)/\(account)")
}

func get(_ service: String, _ account: String, _ reason: String) {
    requireTouchID(reason)
    var q = base(service, account)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    let st = SecItemCopyMatching(q as CFDictionary, &out)
    if st != errSecSuccess { die("get failed: \(osMsg(st))") }
    guard let d = out as? Data else { die("get: no data") }
    FileHandle.standardOutput.write(d)
}

func del(_ service: String, _ account: String) {
    let st = SecItemDelete(base(service, account) as CFDictionary)
    if st != errSecSuccess && st != errSecItemNotFound { die("delete failed: \(osMsg(st))") }
    print("deleted \(service)/\(account)")
}

let a = CommandLine.arguments
guard a.count >= 4 else { die("usage: tpkc <store|get|delete> <service> <account> [reason]") }
let (cmd, service, account) = (a[1], a[2], a[3])
switch cmd {
case "store":  store(service, account)
case "get":    get(service, account, a.count >= 5 ? a[4] : "Unlock \(service)")
case "delete": del(service, account)
default:       die("unknown command: \(cmd)")
}
