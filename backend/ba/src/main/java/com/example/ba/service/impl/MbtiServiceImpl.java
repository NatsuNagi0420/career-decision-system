/**
 * 文件说明：MBTI 测评业务实现类。
 * 职责：基于题库与选项表实现 MBTI 题目装配、用户答案持久化以及最终 MBTI 性格类型的计算。
 */
package com.example.ba.service.impl;

import com.example.ba.dto.MbtiSubmitDTO;
import com.example.ba.mapper.MbtiMapper;
import com.example.ba.pojo.MbtiOption;
import com.example.ba.pojo.MbtiQuestion;
import com.example.ba.pojo.MbtiUserAnswer;
import com.example.ba.service.MbtiService;
import com.example.ba.vo.MbtiQuestionVO;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MbtiServiceImpl implements MbtiService {

    @Autowired
    private MbtiMapper mbtiMapper;

    @Override
    public List<MbtiQuestionVO> getAllQuestionsWithOptions() {
        List<MbtiQuestion> questions = mbtiMapper.findAllQuestions();
        List<MbtiOption> allOptions = mbtiMapper.findAllOptions();
        
        // Group options by question id
        Map<Integer, List<MbtiOption>> optionMap = allOptions.stream()
                .collect(Collectors.groupingBy(MbtiOption::getQId));
        
        return questions.stream().map(q -> {
            MbtiQuestionVO vo = new MbtiQuestionVO();
            BeanUtils.copyProperties(q, vo);
            vo.setOptions(optionMap.get(q.getId()));
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    @Transactional
    public String submitTest(MbtiSubmitDTO submitDTO) {
        String testNo = UUID.randomUUID().toString().replace("-", "");
        Map<String, Integer> scoreMap = new HashMap<>();
        
        // 初始化维度评分
        String[] dimensions = {"E", "I", "S", "N", "T", "F", "J", "P"};
        for (String d : dimensions) scoreMap.put(d, 0);

        // 处理每一道题
        submitDTO.getAnswers().forEach((qId, optCode) -> {
            MbtiOption option = mbtiMapper.findOptionByQuestionAndCode(qId, optCode);
            if (option != null) {
                // 保存答案
                MbtiUserAnswer answer = new MbtiUserAnswer();
                answer.setUserId(submitDTO.getUserId());
                answer.setTestNo(testNo);
                answer.setQId(qId);
                answer.setOptCode(optCode);
                answer.setScoreCode(option.getScoreCode());
                mbtiMapper.insertAnswer(answer);
                
                // 累计评分
                scoreMap.put(option.getScoreCode(), scoreMap.get(option.getScoreCode()) + option.getScore());
            }
        });

        // 计算最终 MBTI 类型
        StringBuilder mbtiType = new StringBuilder();
        mbtiType.append(scoreMap.get("E") >= scoreMap.get("I") ? "E" : "I");
        mbtiType.append(scoreMap.get("S") >= scoreMap.get("N") ? "S" : "N");
        mbtiType.append(scoreMap.get("T") >= scoreMap.get("F") ? "T" : "F");
        mbtiType.append(scoreMap.get("J") >= scoreMap.get("P") ? "J" : "P");

        return mbtiType.toString();
    }
}
