package com.runoot.test;
 
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.HashMap;
import java.util.Map;
  
public class HelloServlet extends HttpServlet {
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        this.doGet(req,resp);
    }
 
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        resp.setCharacterEncoding("utf-8");
 
        String username=req.getParameter("username");
        String availiable="0";
        String info="该用户名可以使用！";
        Map<String,String> map=new HashMap();
 
 
        if(username!=null&&!username.equals("")){
            if(username.equals("3127")){
                availiable="1";
                info="对不起，该用户名已被使用！";
            }
        }
 
        map.put("availiable",availiable);
        map.put("info",info);
 
        PrintWriter writer = resp.getWriter();
       // writer.print(JSON.toJSON(map));
        writer.flush();
        writer.close();
    }
    }