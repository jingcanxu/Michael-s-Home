package exceltoDB;
 
import java.io.FileInputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
 
import org.apache.poi.hssf.usermodel.HSSFSheet;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.junit.Test;
 
public class LoadtoDB {
 
        //获取数据库连接
	public static Connection getConnection() throws Exception {
		Class.forName("oracle.jdbc.driver.OracleDriver");
		Connection connection = DriverManager.getConnection("jdbc:oracle:thin:@localhost:1521", "mx", "mx");
		return connection;
	}
	
	
	public static void main(String[] args) {
		try {
                        //获取excel文件的输入流，必须是.xls后缀，如果是xlsx后缀，要用XSSFWorkBook
			FileInputStream fis = new FileInputStream("C:\\Users\\Jingcan Xu\\Desktop\\data model.xls");
			HSSFWorkbook hssfWorkbook = new HSSFWorkbook(fis);
                        //获取表格
			HSSFSheet sheetAt = hssfWorkbook.getSheetAt(1);
			Connection connection = getConnection();
			String sql = "insert into z_src_kit_kits values(?,?,?,?,?)";
			PreparedStatement ps = connection.prepareStatement(sql);
                        //遍历每行及每个单元格
			for (Row row : sheetAt) {
                                //每个单元格有不同的数值类型，具体可以通过cell的getCellType()方法查看
				ps.setString(1, row.getCell(0).getStringCellValue().toString());
				ps.setString(2, row.getCell(1).getStringCellValue().toString());
				//ps.setInt(3, (int)row.getCell(2).getNumericCellValue());
				ps.setString(3, row.getCell(2).getStringCellValue().toString());
				ps.setString(4, row.getCell(3).getStringCellValue().toString());
				ps.setString(5, row.getCell(4).getStringCellValue().toString());
				//ps.setInt(5, (int)row.getCell(4).getNumericCellValue());
				ps.execute();
			}
			ps.close();
			connection.close();
		}catch (Exception e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}
 
}