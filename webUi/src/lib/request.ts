export async function verifyId(id: string) {
    const res = await fetch("/verify/" + id, {
        mode: "cors",
    });
    if (res.ok) {
        const data: { valid: boolean; uploaded: boolean, edited: boolean } =
            await res.json();
        return data;
    }
    return { valid: false, uploaded: false, edited: false };
}

export async function uploadFiles(id: string, file: File) {
    const formData = new FormData();
    formData.append("upload", file);
    const res = await fetch("/upload/" + id, {
        method: "POST",
        body: formData,
        mode: "cors",
    });
    if (res.ok) {
        return { success: true };
    } else {
        return { success: false, reason: await res.text() };
    }
}

export async function fetchFile(id: string) {
    const res = await fetch("/file/" + id, {
        mode: "cors",
    });
    if (res.ok) {
        const data: Blob = await res.blob();
        return { success: true, data };
    } else {
        return { success: false, reason: await res.text() };
    }
}