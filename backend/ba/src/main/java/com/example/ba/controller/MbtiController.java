/**
 * 文件说明：MBTI 测评控制器。
 * 职责：向前端提供 MBTI 题目与选项列表接口，以及接收用户提交答案并计算 MBTI 类型的接口。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.MbtiSubmitDTO;
import com.example.ba.exception.BusinessException;
import com.example.ba.service.MbtiService;
import com.example.ba.vo.MbtiQuestionVO;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/mbti")
@CrossOrigin // 开放跨域访问
public class MbtiController {

    @Autowired
    private MbtiService mbtiService;

    @GetMapping("/questions")
    public Result<List<MbtiQuestionVO>> getQuestions() {
        List<MbtiQuestionVO> questions = mbtiService.getAllQuestionsWithOptions();
        return Result.success(questions);
    }

    @PostMapping("/submit")
    public Result<String> submit(@Valid @RequestBody MbtiSubmitDTO submitDTO) {
        String mbtiType = mbtiService.submitTest(submitDTO);
        return Result.success(mbtiType);
    }
}
