package readXML;

import org.jdom2.Attribute;
import org.jdom2.Document;
import org.jdom2.Element;
import org.jdom2.JDOMException;
import org.jdom2.input.JDOMParseException;
import org.jdom2.input.SAXBuilder;
import java.io.*;
import java.util.List;


public class XMLRead {
  public static void main(String[] args){
    SAXBuilder saxBuilder = new SAXBuilder();
    InputStream in;
    
    try{
      in = new FileInputStream(new File("C:\\Users\\Jingcan Xu\\git\\tst.xml"));
     // in = new FileInputStream(new File("\\STUDY\\NewFile.xml"));
      Document document = saxBuilder.build(in);
      Element rootElement = document.getRootElement();
      List<Element> bookList = rootElement.getChildren();
      for(Element book: bookList){
        System.out.println("µÚ" + (bookList.indexOf(book)+1) + "±¾Êé£¡");
        List<Attribute> attrs = book.getAttributes();
        for(Attribute attr: attrs){
          System.out.println(attr.getName() + "=" + attr.getValue());
        }
        for(Element item: book.getChildren()){
          System.out.println(item.getName() + ":" + item.getValue());
        }
        System.out.println("------------------------------------");
      }
    }catch (FileNotFoundException e){
      e.printStackTrace();
    }catch (JDOMException e){
      e.printStackTrace();
    }catch (IOException e){
      e.printStackTrace();
    }
  }
}