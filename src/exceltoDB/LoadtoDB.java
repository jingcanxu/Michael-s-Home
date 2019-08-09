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
 
        //��ȡ���ݿ�����
	public static Connection getConnection() throws Exception {
		Class.forName("oracle.jdbc.driver.OracleDriver");
		Connection connection = DriverManager.getConnection("jdbc:oracle:thin:@localhost:1521", "mx", "mx");
		return connection;
	}
	
	
	public static void main(String[] args) {
		try {
                        //��ȡexcel�ļ�����������������.xls��׺�������xlsx��׺��Ҫ��XSSFWorkBook
			FileInputStream fis = new FileInputStream("C:\\Users\\Jingcan Xu\\Desktop\\data model.xls");
			HSSFWorkbook hssfWorkbook = new HSSFWorkbook(fis);
                        //��ȡ���
			HSSFSheet sheetAt = hssfWorkbook.getSheetAt(1);
			Connection connection = getConnection();
			String sql = "insert into z_src_kit_kits values(?,?,?,?,?)";
			PreparedStatement ps = connection.prepareStatement(sql);
                        //����ÿ�м�ÿ����Ԫ��
			for (Row row : sheetAt) {
                                //ÿ����Ԫ���в�ͬ����ֵ���ͣ��������ͨ��cell��getCellType()�����鿴
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