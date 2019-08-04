<%--
  Created by IntelliJ IDEA.
  User: 3127
  Date: 2017/4/23
  Time: 14:57
  To change this template use File | Settings | File Templates.
--%>
<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<html>
<head>
    <%
        String path=request.getContextPath();
    %>
    <title></title>
    <script type="text/javascript" src="<%=path%>/jquery/jquery.min.js"></script>
    <style>
        #username-info{
            display: none;
            border: none;
        }
        label{
            display: block;
            margin-top: 3px;
        }
    </style>
</head>
<body>
<form id="myForm">
    <label for="username">username:<input type="text" id="username"/><input type="text" id="username-info"/></label>
    <label for="password">password:<input type="text" id="password"/></label>
</form>
<script>
 
    $("#username").on("blur",function(){
        var username=$("#username").val();
        if(username!=undefined&&username.length>0){
            $.ajax({
                type:"post",//type可以为post也可以为get
                url:"demo2",
                data:{"username":username},//这行不能省略，如果没有数据向后台提交也要写成data:{}的形式
                dataType:"json",//这里要注意如果后台返回的数据不是json格式，那么就会进入到error:function(data){}中
                success:function(data){
                    $("#username-info").css("display","block");
                    if(data.availiable==="0"){
                        $("#username-info").css("color","green");
                    }else{
                        $("#username-info").css("color","red");
                    }
                    $("#username-info").val(data.info);
                },
                error:function(data){
                    alert("用户名提交出现了错误！");
                }
            });
        }else{
            alert("用户名不能为空！")
            return false;
        }
    })
</script>
</body>
</html>
 