package connectDB;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;

 
public class DBConnection {
	public static void main(String args[]) throws Exception {
		// write your code here
        
		try {
			// ����oracle����
			Class.forName("oracle.jdbc.driver.OracleDriver");
			// �������ݿ�����
			Connection conn = DriverManager.getConnection(
					"jdbc:oracle:thin:@localhost:1521",
					"mx", "mx");
			System.out.println("���ӳɹ���");
			// ����Statment����
			Statement stmt = conn.createStatement();
			// ��ȡ��ѯ�����
			ResultSet rs = stmt
					.executeQuery("SELECT * FROM z_my_test");
			System.out.println("��ѯ�ɹ���");
			// ���ʽ�����е�����
			while (rs.next()) {
				System.out.println(rs.getString(1)+","+rs.getString(2)+","+rs.getString(3));
			}
			// �رս����
			//rs.close();
			//�ر�����
			//stmt.close();
			//�ر�����
			//conn.close();
		} catch (ClassNotFoundException e) {
			e.printStackTrace();
		} catch (SQLException e) {
			e.printStackTrace();
		}
 
	}
}
