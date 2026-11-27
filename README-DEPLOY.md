# SNP Studio Linux 部署包

目标 SSH：FinalShell 中的“网站”连接。指定父目录：`/home/hnadmin/data/syj`。

本包建议放在独立子目录 `/home/hnadmin/data/syj/snp-studio-20261018`，避免覆盖父目录中的其他项目。远端实际目录、已有服务、权限和访问地址仍需登录服务器后检查。

## 文件

- `dist/`：最新版可直接运行的静态网页，包含真实矩阵校验/描述性质控和模拟科研图。
- `start-server.py`：Python 3.7+ 标准库静态服务；不安装依赖、不训练模型、不修改系统服务。
- `SHA256SUMS`：核对本次上传的网页文件是否完整。
- `nginx-location.example.conf`：给现有 Nginx 站点参考的路径配置，不会自动应用。

## 已有 Web 服务

如果服务器已经用 Nginx/Apache 提供网页，将对应站点的网页根目录配置为此包的 `dist/`，或者给现有站点添加独立的 `/syj/` 路径。修改前应备份配置，检查配置语法并确认不会覆盖已有路径。

## 独立运行

通过已登录的 SSH 终端执行：

```sh
cd /home/hnadmin/data/syj/snp-studio-20261018
sha256sum -c SHA256SUMS
python3 start-server.py
python3 start-server.py --status
```

默认监听 `0.0.0.0:8080`；被其他程序占用时尝试后续 19 个端口，不停止其他程序。程序打印实际端口；重新运行会复用本目录的服务。日志在 `.runtime/server.log`。重启服务器后需要再次启动；此脚本不会自动添加开机启动。

如果只供已有反向代理使用：`python3 start-server.py --host 127.0.0.1 --port 8080`。

最终访问地址取决于目标服务器 IP、现有站点配置和 FRP 的 HTTP/TCP 映射。`frp-pen.com:51359` 是当前 SSH 入口，不能当作网页地址。

## 功能范围

SNP 文件在访问者浏览器内处理，不通过静态服务上传或持久保存；矩阵解析、字段检查、缺失率、MAF 和过滤真实执行。机器学习训练、候选位点和科研图为演示，图及导出内容标注 SIMULATED。

此包不包含 Windows 快捷方式、SSH 凭据、原始研究数据、Git 目录或本地运行日志。
