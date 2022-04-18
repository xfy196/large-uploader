const express = require("express");
const app = express();
const fse = require("fs-extra");
const multiparty = require("multiparty");
const bodyParser = require("body-parser");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "./upload");
app.listen(8080, (err) => {
  if (err) {
    throw err;
  }
  console.log("http://127.0.0.1:8080 服务启动成功");
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  req.method === "OPTIONS"
    ? res.send("CURRENT SERVICES SUPPORT CROSS DOMAIN REQUESTS!")
    : next();
});
app.use(
  bodyParser.urlencoded({
    limit: "1024mb",
    extended: false,
  })
);
app.use(bodyParser.json());
app.post("/upload_chunk", (req, res) => {
  const multipart = new multiparty.Form({
    maxFieldsSize: 200 * 1024 * 1024,
  });
  multipart.parse(req, async (err, fields, files) => {
    if (err) {
      res.send({
        code: 500,
        msg: "服务器错误",
      });
      return;
    }
    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const [hashPrefix] = fields.hashPrefix;
    const chunkDir = path.resolve(UPLOAD_DIR, hashPrefix);
    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir);
    }
    await fse.move(chunk.path, `${chunkDir}/${hash}`);
    res.send({
      code: 200,
      msg: "上传成功",
    });
  });
});

const pipeStream = (path, writeStream) => {
  return new Promise((resolve) => {
    const readStream = fse.createReadStream(path);
    readStream.on("end", () => {
      fse.unlinkSync(path);
      resolve();
    });
    readStream.pipe(writeStream);
  });
};

const createUploadedList = async (fileHash) => fse.existsSync(path.resolve(UPLOAD_DIR, fileHash)) ? await fse.readdir(path.resolve(UPLOAD_DIR, fileHash)) : []

// 合并切片
const mergeFileChunk = async (filePath, filename, size) => {
  const chunkDir = path.resolve(
    UPLOAD_DIR,
    filename.slice(0, filename.lastIndexOf("."))
  );
  const chunkPaths = await fse.readdir(chunkDir);
  // 根据切片下标进行排序
  // 否则直接读取目录的获取的顺序可能会错乱
  chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
  let pipeP = chunkPaths.map((chunkPath, index) =>
    pipeStream(
      path.resolve(chunkDir, chunkPath, ),
      fse.createWriteStream(filePath, {
        start: index * size,
        end: (index + 1) * size,
      })
    )
  );
  await Promise.all(pipeP);
  fse.rmdirSync(chunkDir); // 合并后删除保存的切片目录
};

app.post("/merge_chunk", async (req, res) => {
  //   size是每一个chunk的size
  const { filename, size } = req.body;
  const filePath = path.resolve(UPLOAD_DIR, `${filename}`);
  await mergeFileChunk(filePath, filename, size);
  res.send({
    code: 200,
    msg: "file merged success",
  });
});
app.post("/vertify", async (req, res) => {
  const { filename, fileHash } = req.body;
  const filePath = path.resolve(UPLOAD_DIR, filename);
  if (fse.existsSync(filePath)) {
    res.send({
      code: 200,
      data: {
        shouldUpload: false,
      },
      msg: "文件已上传成功",
    });
    return;
  }
  res.send({
    code: 200,
    data: {
      shouldUpload: true,
      uploadList: await createUploadedList(fileHash)
    },
    msg: "请求成功",
  });
});
