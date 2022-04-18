<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <button @click="handleUpload">
      {{ loading ? "loading...." : "" }}上传
    </button>
    <button v-if="showStopAndResume" @click="stopUpload">暂停</button>
    <button v-if="showStopAndResume" @click="resume">恢复</button>
    <span style="margin-left: 20px">{{ uploadPercentage }}%</span>
  </div>
</template>
<script setup>
import { ref, watchEffect } from "vue";
import request from "../utils/request";
import SparkMd5 from "spark-md5";
import axios from "axios";
const SIZE = 10 * 1024 * 1024; // 切片大小
const uploadFile = ref(null);
const fileHash = ref("");

const showStopAndResume = ref(false);

const loading = ref(false);

const aborts = ref([]);

const uploadPercentage = ref(0);

const data = ref([]);

const getSuffix = (filename) => {
  let arr = filename.split(".");
  return arr[arr.length - 1];
};

const handleFileChange = (e) => {
  fileHash.value = "";
  data.value = [];
  showStopAndResume.value = false;
  const [file] = e.target.files;
  if (!file) return;
  uploadFile.value = file;
};

watchEffect(() => {
  if (!uploadFile.value || !data.value.length) {
    uploadPercentage.value = 0;
    return;
  }
  const loaded = data.value
    .map((item) => item.chunk.size * item.percentage)
    .reduce((acc, cur) => acc + cur, 0);
  uploadPercentage.value = parseInt(
    (loaded / uploadFile.value.size).toFixed(2)
  );
});

// 上传切片
const uploadChunk = async (uploadList = []) => {
  const requestList = data.value
    .filter(({ hash }) => !uploadList.includes(hash))
    .map(({ chunk, hash, index, hashPrefix }) => {
      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("hash", hash);
      formData.append("filename", uploadFile.value.name);
      formData.append("index", index);
      formData.append("hashPrefix", hashPrefix);
      return { formData, index };
    })
    .map(async ({ formData, index }) => {
      return request({
        url: "/upload_chunk",
        data: formData,
        onUploadProgress: onPregress.bind(null, data.value[index]),
        cancelToken: new axios.CancelToken((c) => {
          aborts.value.push(c);
        }),
        headers: {
          "Content-Type": "multipart/form-data",
        },
        method: "post",
      });
    });
  showStopAndResume.value = true;
  await Promise.all(requestList);
  // 合并切片
  await mergeRequest();
  aborts.value = [];
};

const onPregress = (item, e) => {
  if (e.lengthComputable) {
    item.percentage = parseInt((e.loaded / e.total) * 100);
  }
};

const createFileChunk = async (file, size = SIZE) => {
  const fileChunkList = [];
  let spark = new SparkMd5.ArrayBuffer();
  let readerComplete = false;
  const reader = new FileReader();

  for (let cur = 0; cur < file.size; cur += size) {
    let data = { file: file.slice(cur, cur + size) };
    fileChunkList.push(data);
    reader.readAsArrayBuffer(data.file);
    await new Promise((resolve) => {
      reader.onload = (e) => {
        spark.append(e.target.result);
        resolve();
      };
    });
  }
  fileHash.value = spark.end();
  return fileChunkList;
};

// 暂停上传
const stopUpload = () => {
  aborts.value.forEach((abort) => {
    abort("取消请求");
  });
  console.log("暂停成功");
};
// 恢复上传
const resume = async () => {
  let vertifyRes = await request({
    url: "/vertify",
    method: "post",
    data: {
      fileHash: fileHash.value,
      filename: fileHash.value + "." + getSuffix(uploadFile.value.name),
    },
  });
  if (vertifyRes.data.shouldUpload) {
    await uploadChunk(vertifyRes.data.uploadList);
    loading.value = false;
  }
  loading.value = false;
};
const handleUpload = async () => {
  if (!uploadFile.value) return;
  loading.value = true;
  const fileChunkList = await createFileChunk(uploadFile.value);
  let vertifyRes = await request({
    url: "/vertify",
    method: "post",
    data: {
      fileHash: fileHash.value,
      filename: fileHash.value + "." + getSuffix(uploadFile.value.name),
    },
  });
  if (!vertifyRes.data.shouldUpload) {
    alert(vertifyRes.msg);
    uploadPercentage.value = 100;
    loading.value = false;
    return;
  }
  data.value = fileChunkList.map(({ file }, index) => ({
    chunk: file,
    hashPrefix: fileHash.value,
    suffix: getSuffix(uploadFile.value.name),
    hash: fileHash.value + "-" + index,
    index: index,
    percentage: 0,
  }));
  await uploadChunk(vertifyRes.data.uploadList);
  loading.value = false;
};
const mergeRequest = async () => {
  let spark = new SparkMd5.ArrayBuffer();
  spark.append(uploadFile.value);
  let res = await request({
    url: "/merge_chunk",
    headers: {
      "Content-Type": "application/json",
    },
    method: "post",
    data: {
      originName: uploadFile.value.name,
      filename: fileHash.value + "." + getSuffix(uploadFile.value.name),
      size: SIZE,
    },
  });
};
</script>
<style lang=""></style>
