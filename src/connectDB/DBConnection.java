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
			// 加载oracle驱动
			Class.forName("oracle.jdbc.driver.OracleDriver");
			// 建立数据库连接
			Connection conn = DriverManager.getConnection(
					"jdbc:oracle:thin:@localhost:1521",
					"mx", "mx");
			System.out.println("连接成功！");
			// 创建Statment对象
			Statement stmt = conn.createStatement();
			// 获取查询结果集
			ResultSet rs = stmt
					.executeQuery("SELECT * FROM z_my_test");
			System.out.println("查询成功！");
			// 访问结果集中的数据
			while (rs.next()) {
				System.out.println(rs.getString(1)+","+rs.getString(2)+","+rs.getString(3));
			}
			// 关闭结果集
			//rs.close();
			//关闭载体
			//stmt.close();
			//关闭连接
			//conn.close();
		} catch (ClassNotFoundException e) {
			e.printStackTrace();
		} catch (SQLException e) {
			e.printStackTrace();
		}
 
	}
}
