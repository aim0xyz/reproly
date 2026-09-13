import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public final class BugDropURLSessionDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let bugDrop: BugDrop

    public init(bugDrop: BugDrop = .shared) {
        self.bugDrop = bugDrop
        super.init()
    }

    public func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        bugDrop.captureFailedRequest(task.originalRequest ?? task.currentRequest ?? URLRequest(url: URL(string: "https://invalid.local")!), response: task.response, error: error)
    }
}

public extension BugDrop {
    func makeURLSession(
        configuration: URLSessionConfiguration = .default,
        delegateQueue: OperationQueue? = nil
    ) -> URLSession {
        URLSession(
            configuration: configuration,
            delegate: BugDropURLSessionDelegate(bugDrop: self),
            delegateQueue: delegateQueue
        )
    }
}
