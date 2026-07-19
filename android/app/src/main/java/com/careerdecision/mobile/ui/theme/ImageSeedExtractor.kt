package com.careerdecision.mobile.ui.theme

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import com.materialkolor.quantize.QuantizerCelebi
import com.materialkolor.score.Score
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ImageSeedExtractor(context: Context) {
    private val resolver = context.applicationContext.contentResolver
    private val backgroundDirectory = File(context.applicationContext.filesDir, "appearance")

    suspend fun extract(uri: Uri): List<String> = withContext(Dispatchers.IO) {
        val bytes = readValidatedImage(uri)
        val oriented = decodeOriented(bytes, DECODE_MAX_DIMENSION)
        val scale = minOf(
            1f,
            SAMPLE_DIMENSION.toFloat() / oriented.width,
            SAMPLE_DIMENSION.toFloat() / oriented.height
        )
        val sampled = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                oriented,
                maxOf(1, (oriented.width * scale).toInt()),
                maxOf(1, (oriented.height * scale).toInt()),
                true
            )
        } else {
            oriented
        }

        try {
            val allPixels = IntArray(sampled.width * sampled.height)
            sampled.getPixels(allPixels, 0, sampled.width, 0, 0, sampled.width, sampled.height)
            val opaquePixels = allPixels.filterToIntArray { pixel -> pixel ushr 24 >= 200 }
            if (opaquePixels.isEmpty()) return@withContext listOf(DEFAULT_SEED_COLOR)
            val quantized = QuantizerCelebi.quantize(opaquePixels, 128)
            Score.score(
                colorsToPopulation = quantized,
                desired = 4,
                fallbackColorArgb = MaterialColorSchemeGenerator.argbFromHex(DEFAULT_SEED_COLOR),
                filter = true
            ).map(MaterialColorSchemeGenerator::hexFromArgb)
        } finally {
            if (sampled !== oriented) sampled.recycle()
            oriented.recycle()
        }
    }

    suspend fun prepareBackground(uri: Uri): Uri = withContext(Dispatchers.IO) {
        val bytes = readValidatedImage(uri)
        val prepared = decodeOriented(bytes, BACKGROUND_MAX_DIMENSION)
        backgroundDirectory.mkdirs()
        require(backgroundDirectory.isDirectory) { "无法创建背景图片存储目录" }
        val temporary = File(backgroundDirectory, "android-background-candidate.tmp")
        val target = File(backgroundDirectory, "android-background-candidate.webp")
        try {
            FileOutputStream(temporary).use { output ->
                val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Bitmap.CompressFormat.WEBP_LOSSY
                } else {
                    @Suppress("DEPRECATION")
                    Bitmap.CompressFormat.WEBP
                }
                check(prepared.compress(format, BACKGROUND_QUALITY, output)) {
                    "背景图片处理失败"
                }
                output.fd.sync()
            }
            if (target.exists() && !target.delete()) {
                throw IOException("无法替换旧背景图片")
            }
            if (!temporary.renameTo(target)) {
                throw IOException("无法保存处理后的背景图片")
            }
            Uri.fromFile(target)
        } finally {
            prepared.recycle()
            if (temporary.exists()) temporary.delete()
        }
    }

    fun clearPreparedBackground(): Boolean {
        val names = listOf(
            "android-background.webp",
            "android-background.tmp",
            "android-background-candidate.webp",
            "android-background-candidate.tmp"
        )
        return names.all { name ->
            val file = File(backgroundDirectory, name)
            !file.exists() || file.delete()
        }
    }

    fun discardPreparedCandidate(): Boolean {
        val names = listOf(
            "android-background-candidate.webp",
            "android-background-candidate.tmp"
        )
        return names.all { name ->
            val file = File(backgroundDirectory, name)
            !file.exists() || file.delete()
        }
    }

    fun persistReadPermission(uri: Uri): Result<Unit> = runCatching {
        resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    private fun readValidatedImage(uri: Uri): ByteArray {
        require(normalizeBackgroundUri(uri.toString()) != null) {
            "背景必须来自本机文件选择器"
        }
        val output = ByteArrayOutputStream()
        resolver.openInputStream(uri)?.use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= MAX_FILE_BYTES) { "背景图片不能超过 10MB" }
                output.write(buffer, 0, count)
            }
        } ?: throw IOException("无法打开这张背景图片")
        val bytes = output.toByteArray()
        require(bytes.isNotEmpty() && bytes.hasSupportedSignature()) {
            "背景仅支持 JPEG、PNG 或 WebP 图片"
        }
        return bytes
    }

    private fun decodeOriented(bytes: ByteArray, maxDimension: Int): Bitmap {
        val orientation = runCatching {
            ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "背景图片尺寸无效" }
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxDimension)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) {
            "无法读取这张背景图片"
        }
        val oriented = decoded.applyExifOrientation(orientation)
        if (oriented !== decoded) decoded.recycle()
        val scale = minOf(1f, maxDimension.toFloat() / maxOf(oriented.width, oriented.height))
        if (scale >= 1f) return oriented
        val scaled = Bitmap.createScaledBitmap(
            oriented,
            maxOf(1, (oriented.width * scale).toInt()),
            maxOf(1, (oriented.height * scale).toInt()),
            true
        )
        oriented.recycle()
        return scaled
    }

    private fun ByteArray.hasSupportedSignature(): Boolean {
        val jpeg = size >= 3 && this[0] == 0xFF.toByte() && this[1] == 0xD8.toByte() &&
            this[2] == 0xFF.toByte()
        val png = size >= 8 && this[0] == 0x89.toByte() && this[1] == 0x50.toByte() &&
            this[2] == 0x4E.toByte() && this[3] == 0x47.toByte() &&
            this[4] == 0x0D.toByte() && this[5] == 0x0A.toByte() &&
            this[6] == 0x1A.toByte() && this[7] == 0x0A.toByte()
        val webp = size >= 12 && String(this, 0, 4, Charsets.US_ASCII) == "RIFF" &&
            String(this, 8, 4, Charsets.US_ASCII) == "WEBP"
        return jpeg || png || webp
    }

    private fun Bitmap.applyExifOrientation(orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.setRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.setRotate(-90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
            else -> return this
        }
        return Bitmap.createBitmap(this, 0, 0, width, height, matrix, true)
    }

    private fun sampleSize(width: Int, height: Int, maxDimension: Int): Int {
        var sample = 1
        while (width / (sample * 2) >= maxDimension || height / (sample * 2) >= maxDimension) {
            sample *= 2
        }
        return sample
    }

    private inline fun IntArray.filterToIntArray(predicate: (Int) -> Boolean): IntArray {
        val result = IntArray(size)
        var count = 0
        for (value in this) {
            if (predicate(value)) result[count++] = value
        }
        return result.copyOf(count)
    }

    companion object {
        private const val MAX_FILE_BYTES = 10 * 1024 * 1024
        private const val DECODE_MAX_DIMENSION = 512
        private const val SAMPLE_DIMENSION = 112
        private const val BACKGROUND_MAX_DIMENSION = 1920
        private const val BACKGROUND_QUALITY = 86

        val SupportedMimeTypes = arrayOf(
            "image/jpeg",
            "image/png",
            "image/webp"
        )
    }
}
