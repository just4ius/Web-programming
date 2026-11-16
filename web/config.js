// Адреса бекенду. Локально і в Docker Compose — http://localhost:8080.
// У Kubernetes цей файл підміняється через ConfigMap (див. k8s/web.yaml).
window.API_BASE = "http://localhost:8080";
