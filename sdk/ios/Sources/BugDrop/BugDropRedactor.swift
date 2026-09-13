import Foundation

enum BugDropRedactor {
    static func text(_ value: String, limit: Int = 1_600) -> String {
        var result = String(value.prefix(12_000))
        if let urlRegex = try? NSRegularExpression(pattern: #"https?://[^\s<>\"'`]+"#, options: [.caseInsensitive]) {
            let matches = urlRegex.matches(in: result, range: NSRange(result.startIndex..., in: result))
            for match in matches.reversed() {
                guard let range = Range(match.range, in: result) else { continue }
                let raw = String(result[range])
                result.replaceSubrange(range, with: url(URL(string: raw)) ?? "[invalid URL]")
            }
        }
        let replacements: [(String, String)] = [
            (#"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"#, "[email]"),
            (#"\bBearer\s+\S+"#, "Bearer [redacted]"),
            (#"\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]{8,}|github_pat_[\w]{8,}|AKIA[A-Z0-9]{16})\b"#, "[secret]"),
            (#"\beyJ[\w-]+\.[\w-]+\.[\w-]+\b"#, "[token]"),
            (#"((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;}]+)"#, "$1[redacted]")
        ]
        for (pattern, replacement) in replacements {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
            result = regex.stringByReplacingMatches(
                in: result,
                range: NSRange(result.startIndex..., in: result),
                withTemplate: replacement
            )
        }
        result = result.unicodeScalars.filter { scalar in
            scalar.value >= 32 || scalar == "\n" || scalar == "\t"
        }.map(String.init).joined()
        return String(result.prefix(limit))
    }

    static func url(_ value: URL?) -> String? {
        guard let value,
              var components = URLComponents(url: value, resolvingAgainstBaseURL: false),
              components.scheme == "http" || components.scheme == "https" else { return nil }
        components.user = nil
        components.password = nil
        components.query = nil
        components.fragment = nil
        guard var result = components.url.map({ String($0.absoluteString.prefix(600)) }) else { return nil }
        let replacements: [(String, String)] = [
            (#"[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9.-]+\.[A-Z]{2,}"#, "[email]"),
            (#"(?:sk-|ghp_|github_pat_)[\w-]{8,}"#, "[secret]")
        ]
        for (pattern, replacement) in replacements {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
            result = regex.stringByReplacingMatches(
                in: result,
                range: NSRange(result.startIndex..., in: result),
                withTemplate: replacement
            )
        }
        return result
    }
}
