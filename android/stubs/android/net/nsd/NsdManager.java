package android.net.nsd;
public final class NsdManager {
    public static final int PROTOCOL_DNS_SD = 1;
    public interface RegistrationListener {
        void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode);
        void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode);
        void onServiceRegistered(NsdServiceInfo serviceInfo);
        void onServiceUnregistered(NsdServiceInfo serviceInfo);
    }
    public interface DiscoveryListener {
        void onStartDiscoveryFailed(String serviceType, int errorCode);
        void onStopDiscoveryFailed(String serviceType, int errorCode);
        void onDiscoveryStarted(String serviceType);
        void onDiscoveryStopped(String serviceType);
        void onServiceFound(NsdServiceInfo serviceInfo);
        void onServiceLost(NsdServiceInfo serviceInfo);
    }
    public interface ResolveListener {
        void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode);
        void onServiceResolved(NsdServiceInfo serviceInfo);
    }
    public void registerService(NsdServiceInfo serviceInfo, int protocolType, RegistrationListener listener) { throw new RuntimeException("Stub!"); }
    public void unregisterService(RegistrationListener listener) { throw new RuntimeException("Stub!"); }
    public void discoverServices(String serviceType, int protocolType, DiscoveryListener listener) { throw new RuntimeException("Stub!"); }
    public void stopServiceDiscovery(DiscoveryListener listener) { throw new RuntimeException("Stub!"); }
    public void resolveService(NsdServiceInfo serviceInfo, ResolveListener listener) { throw new RuntimeException("Stub!"); }
}
