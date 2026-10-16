package android.content;
/** Compile-only stub of the Android framework (never packaged into the APK). */
public abstract class Context {
    public static final String NSD_SERVICE = "servicediscovery";
    public static final String WIFI_SERVICE = "wifi";
    public abstract Object getSystemService(String name);
    public abstract Context getApplicationContext();
    public abstract java.io.File getFilesDir();
}
