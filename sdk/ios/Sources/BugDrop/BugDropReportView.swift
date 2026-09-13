#if canImport(SwiftUI)
import SwiftUI

@available(iOS 15.0, macOS 12.0, *)
public struct BugDropReportView: View {
    private let bugDrop: BugDrop
    private let includePreviousSession: Bool
    private let onSubmit: (BugDropReport) -> Void

    @State private var title = ""
    @State private var expected = ""
    @State private var actual = ""
    @State private var reviewed = false

    public init(
        bugDrop: BugDrop = .shared,
        includePreviousSession: Bool = false,
        onSubmit: @escaping (BugDropReport) -> Void
    ) {
        self.bugDrop = bugDrop
        self.includePreviousSession = includePreviousSession
        self.onSubmit = onSubmit
    }

    public var body: some View {
        Form {
            Section("What went wrong?") {
                TextField("Short title", text: $title)
                VStack(alignment: .leading) {
                    Text("What should have happened?")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $expected)
                        .frame(minHeight: 72)
                }
                VStack(alignment: .leading) {
                    Text("What happened instead?")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $actual)
                        .frame(minHeight: 72)
                }
            }
            Section("Evidence") {
                let report = bugDrop.report(includePreviousSession: includePreviousSession)
                Text("\(report.events.count) locally captured events")
                Text("Failed requests include only method, status, and a URL without query parameters. Bodies, headers, and input values are excluded.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if includePreviousSession && bugDrop.previousSessionReport() != nil {
                    Text("Previous-session evidence is included. It is not proof that the app crashed.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                Toggle("I reviewed this report for private information", isOn: $reviewed)
                Button("Send report") {
                    onSubmit(bugDrop.report(
                        title: title.isEmpty ? "Untitled bug" : title,
                        expected: expected,
                        actual: actual,
                        includePreviousSession: includePreviousSession
                    ))
                }
                .disabled(!reviewed)
            }
        }
        .navigationTitle("Report a bug")
    }
}
#endif
