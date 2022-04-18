import axios from "axios";

const request = axios.create({
  timeout: 20 * 1000,
  baseURL: "http://127.0.0.1:8080",
});
request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (err) => {
    return Promise.reject(err);
  }
);
export default request;
