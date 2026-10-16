package android.webkit;
public class WebChromeClient {
    public WebChromeClient() { throw new RuntimeException("Stub!"); }
    public boolean onShowFileChooser(WebView webView, ValueCallback<android.net.Uri[]> filePathCallback, FileChooserParams fileChooserParams) { throw new RuntimeException("Stub!"); }
    public static abstract class FileChooserParams {
        public FileChooserParams() { throw new RuntimeException("Stub!"); }
        public static android.net.Uri[] parseResult(int resultCode, android.content.Intent data) { throw new RuntimeException("Stub!"); }
        public abstract android.content.Intent createIntent();
    }
}
