package br.com.gushrs.organizacaocredito;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Baixa o APK de uma Release do próprio repositório e abre o instalador do Android. */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private static final String ALLOWED_PREFIX = "https://github.com/GusHRSGH/organizacao-credito/releases/download/";

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void installFromUrl(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED_PREFIX) || !url.endsWith(".apk")) {
            call.reject("Endereço de atualização não permitido.");
            return;
        }
        if (!getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Permita instalar apps desta fonte nas configurações do Android.", "NEEDS_PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Não foi possível criar a pasta de download.");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File target = new File(dir, "atualizacao.apk");

                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != 200) throw new Exception("O GitHub respondeu com erro " + connection.getResponseCode() + ".");
                long total = connection.getContentLengthLong();
                long done = 0;
                int lastPercent = -1;
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        done += read;
                        if (total > 0) {
                            int percent = (int) (done * 100 / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                JSObject progress = new JSObject();
                                progress.put("percent", percent);
                                notifyListeners("progress", progress);
                            }
                        }
                    }
                } finally {
                    connection.disconnect();
                }
                if (target.length() < 100000) throw new Exception("O arquivo baixado parece incompleto.");

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", target);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Falha ao baixar a atualização." : error.getMessage());
            }
        }).start();
    }
}
