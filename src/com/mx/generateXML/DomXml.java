package com.mx.generateXML;
import java.io.File;
import java.io.FileOutputStream;

import org.jdom2.Document;
import org.jdom2.Element;
import org.jdom2.output.Format;
import org.jdom2.output.XMLOutputter;
import org.junit.Test;

public class DomXml {

@Test
public void test(){
Long start = System.currentTimeMillis();
createXml();
System.out.println("����ʱ�䣺"+ (System.currentTimeMillis() - start));
}

/**
* ����xml����
*/
public static void createXml(){
try {
// 1������һ�����ڵ�
Element rss = new Element("rss");
// 2��Ϊ�ڵ��������
rss.setAttribute("version", "2.0");	
// 3������һ��document����
Document document = new Document(rss);

Element channel = new Element("channel");
rss.addContent(channel);
Element title = new Element("title");
title.setText("������������");
channel.addContent(title);

Format format = Format.getCompactFormat();
// ���û���Tab��ո�
format.setIndent("	");
format.setEncoding("UTF-8");

// 4������XMLOutputter�Ķ���
XMLOutputter outputer = new XMLOutputter(format);
// 5������outputer��documentת����xml�ĵ�
File file = new File("rssNew.xml");
outputer.output(document, new FileOutputStream(file));

System.out.println("����rssNew.xml�ɹ�");
} catch (Exception e) {
System.out.println("����rssNew.xmlʧ��");
}
}

}
 