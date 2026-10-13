import java.lang.reflect.Field;
import org.eclipse.jetty.server.Connector;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import software.amazon.dynamodb.services.local.main.ServerRunner;
import software.amazon.dynamodb.services.local.server.DynamoDBProxyServer;

/**
 * DynamoDB Local, from its own command-line arguments, listening on 127.0.0.1 only: its own launcher
 * listens on every interface and has no option for the address. It exits once its standard input
 * closes, so it never outlives the process that started it.
 */
public class DynamoDbLocalOnLoopback {
  public static void main(String[] args) throws Exception {
    DynamoDBProxyServer proxy = ServerRunner.createServerFromCommandLineArgs(args);
    Field jetty = DynamoDBProxyServer.class.getDeclaredField("server");
    jetty.setAccessible(true);
    for (Connector connector : ((Server) jetty.get(proxy)).getConnectors()) {
      ((ServerConnector) connector).setHost("127.0.0.1");
    }
    proxy.start();
    System.in.transferTo(java.io.OutputStream.nullOutputStream());
    System.exit(0);
  }
}
