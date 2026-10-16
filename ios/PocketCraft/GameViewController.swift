import UIKit
import WebKit

/// Full-screen WKWebView that runs the game bundle from the app's `www` folder.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private var bridge: NativeBridge!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let contentController = WKUserContentController()
        config.userContentController = contentController

        let web = WKWebView(frame: .zero, configuration: config)
        bridge = NativeBridge(webView: web)
        contentController.add(WeakScriptHandler(bridge), name: "bridge")

        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.panGestureRecognizer.isEnabled = false
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.allowsLinkPreview = false
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        webView = web
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else {
            let label = UILabel()
            label.text = "www/index.html is missing from the app bundle.\nRun `npm run build` and rebuild."
            label.numberOfLines = 0
            label.textColor = .white
            label.frame = view.bounds.insetBy(dx: 20, dy: 20)
            view.addSubview(label)
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
    }

    func saveGame() {
        webView?.evaluateJavaScript("window.__app && window.__app.autosave && window.__app.autosave()", completionHandler: nil)
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }

    // If iOS kills the web content process (memory pressure) just reload the game.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

/// Breaks the retain cycle WKUserContentController -> handler -> webView.
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
