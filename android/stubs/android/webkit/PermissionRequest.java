package android.webkit;

/** Stub só para compilar (API 21). Não vai para o APK: a classe real vem do Android. */
public abstract class PermissionRequest {
    public static final String RESOURCE_AUDIO_CAPTURE = "android.webkit.resource.AUDIO_CAPTURE";
    public abstract String[] getResources();
    public abstract void grant(String[] resources);
    public abstract void deny();
}
