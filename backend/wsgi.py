"""Flask 進入點。

開發：flask --app wsgi:app run --port 5000
單一 port 模式（由 Flask 提供 React 建置產物）：SET SERVE_FRONTEND=1
"""

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
